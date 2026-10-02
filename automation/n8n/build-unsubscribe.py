#!/usr/bin/env python3
"""Build the private, authenticated CRM-suppression workflow; never activate it.

Only an authenticated server/worker may call this endpoint. This is deliberately
NOT the public email link: opaque-token issuance, confirmation and the durable
edge queue must be completed before marketing can use the web unsubscribe path.
All credentials are references to n8n's credential store, not secret values.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import uuid

WORKFLOW_ID = "6d8bd8e6-3a2d-4f97-8ac9-2a2c5c3fbb01"
HEADERS = ["email_normalizado", "canal", "motivo", "fecha", "fuente", "evento_ref"]

VALIDATE_JS = r"""
const input = $input.first().json.body;
const fail = () => [{json:{valid:false,error:'invalid_request'}}];
if (!input || Array.isArray(input) || typeof input !== 'object'
    || Object.keys(input).sort().join(',') !== 'email,eventId,requestedAt') return fail();
const {email,eventId,requestedAt} = input;
if (typeof email !== 'string' || email.length > 254 || email !== email.trim()
    || !/^[^\s@"\\<>\u0000-\u001f\u007f]+@[^\s@"\\<>\u0000-\u001f\u007f]+\.[^\s@"\\<>\u0000-\u001f\u007f]+$/.test(email)
    || typeof eventId !== 'string' || !/^[a-f0-9]{64}$/.test(eventId)
    || typeof requestedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(requestedAt)) return fail();
const requested = Date.parse(requestedAt);
if (!Number.isFinite(requested) || requested > Date.now()+60000) return fail();
const canonicalDate = new Date(requested).toISOString();
if (canonicalDate !== (requestedAt.includes('.') ? requestedAt : requestedAt.replace('Z','.000Z'))) return fail();
return [{json:{valid:true,email:email.toLowerCase(),eventId,requestedAt:canonicalDate}}];
"""

READ_CHECK_JS = r"""
const H = __HEADERS__;
const values = $json.values;
const validEmail = value => typeof value === 'string' && value.length <= 254
  && value === value.trim() && /^[^\s@"\\<>\u0000-\u001f\u007f]+@[^\s@"\\<>\u0000-\u001f\u007f]+\.[^\s@"\\<>\u0000-\u001f\u007f]+$/.test(value);
const compatible = !$json.error && Array.isArray(values) && values.length <= 50000
  && Array.isArray(values[0]) && values[0].length === H.length
  && H.every((header,index)=>values[0][index] === header)
  && values.slice(1).every(row=>Array.isArray(row) && row.length<=H.length
    && validEmail(row[0]) && row[1] === 'email');
const ctx = $('Validar evento de baja').first().json;
const suppressed = compatible && values.slice(1).some(row=>row[0].toLowerCase() === ctx.email);
""".replace("__HEADERS__", json.dumps(HEADERS))

PREPARE_JS = READ_CHECK_JS + r"""
if (!compatible) return [{json:{available:false,error:'suppression_unavailable'}}];
return [{json:{...ctx,available:true,suppressed,
  row:[ctx.email,'email','baja',ctx.requestedAt,'baja-confirmada-v1',ctx.eventId]}}];
"""

CONFIRM_JS = READ_CHECK_JS + r"""
// A 200 append acknowledgement is insufficient. Equally, a lost acknowledgement
// is not proof of failure: reconcile the actual suppression table before reply.
return [{json:{ok:compatible && suppressed,eventId:ctx.eventId,
  error:compatible && suppressed ? null : 'suppression_unconfirmed'}}];
"""


def build_workflow(sheet_id: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,160}", sheet_id):
        raise ValueError("invalid_sheet_id")
    nodes = []
    edges: dict = {}

    def add(name, kind, parameters, version, position, note, **extra):
        node = {"id":uuid.uuid5(uuid.UUID(WORKFLOW_ID),name).hex,
                "name":name,"type":"n8n-nodes-base."+kind,"typeVersion":version,
                "parameters":parameters,"position":list(position),
                "notes":note,"notesInFlow":False,**extra}
        nodes.append(node)
        return node

    def connect(source, destination, output=0):
        edges.setdefault(source,{"main":[]})
        while len(edges[source]["main"]) <= output:
            edges[source]["main"].append([])
        edges[source]["main"][output].append({"node":destination,"type":"main","index":0})

    def condition(name, key, position, note):
        return add(name,"if",{"conditions":{"options":{"caseSensitive":True,"typeValidation":"strict","version":2},
          "conditions":[{"id":key,"leftValue":"={{ $json."+key+" }}","operator":{"type":"boolean","operation":"true","singleValue":True}}],
          "combinator":"and"},"options":{}},2.2,position,note)

    def respond(name, expression, status, position, note):
        return add(name,"respondToWebhook",{"respondWith":"json","responseBody":expression,
          "options":{"responseCode":status,"responseHeaders":{"entries":[{"name":"Cache-Control","value":"no-store"}]}}},1.1,position,note)

    base = "https://sheets.googleapis.com/v4/spreadsheets/"+sheet_id+"/values/Supresion"
    sheet_credentials = {"googleSheetsOAuth2Api":{"id":"placehold_googleSheetsOAuth2Api","name":"Sheets VARINO"}}
    def read(name, position, note):
        return add(name,"httpRequest",{"method":"GET","url":base+"?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE",
          "authentication":"predefinedCredentialType","nodeCredentialType":"googleSheetsOAuth2Api","options":{"timeout":10000}},
          4.2,position,note,credentials=sheet_credentials,onError="continueRegularOutput")

    add("Recibir baja autenticada","webhook",{"httpMethod":"POST","path":"unsub-sync",
      "authentication":"headerAuth","responseMode":"responseNode","options":{"allowedOrigins":"https://varinoai.me"}},
      2,(0,0),"Solo worker/gateway autorizado mediante Header Auth. No usar como enlace público, no GET ni email/token en URL. Una petición contiene un solo evento.",
      webhookId="varino-unsub-sync",credentials={"httpHeaderAuth":{"id":"placehold_httpHeaderAuth_unsub","name":"VARINO Webhook Auth · unsub-sync"}})
    add("Validar evento de baja","code",{"jsCode":VALIDATE_JS},2,(240,0),"Valida exactamente email, eventId opaco y fecha UTC. Rechaza campos extra, inyección de cabeceras y fechas inválidas. No prueba consentimiento ni habilita marketing.")
    condition("¿Evento válido?","valid",(480,0),"Solo el evento validado llega a Sheets; errores devuelven 400 sin leer ni escribir CRM.")
    respond("Rechazar evento",'{"ok":false,"error":"invalid_request"}',400,(720,240),"400 sin contacto, credenciales ni detalles de validación.")
    read("Leer supresión actual",(720,0),"Lectura fresca autenticada del registro central Supresion. Sin reintentos ni registro del contenido; fallo impide escribir o confirmar baja.")
    add("Preparar supresión","code",{"jsCode":PREPARE_JS},2,(960,0),"Comprueba cabeceras exactas, filas y canal. Reutiliza bajas previas de la misma dirección, incluso otro evento. Formato RAW evita interpretación de fórmulas.")
    condition("¿Registro compatible?","available",(1200,0),"Un esquema incompatible devuelve 503 y requiere reparación; nunca se interpreta como lista vacía.")
    condition("¿Baja ya registrada?","suppressed",(1440,0),"Si ya existe una baja para este email, confirma sin duplicar ni cambiar el historial. La baja sigue vigente aunque Leads tenga un checkbox antiguo.")
    respond("Confirmar baja existente","={{ JSON.stringify({ok:true,eventId:$json.eventId,suppressed:true,duplicate:true}) }}",200,(1680,-240),"Confirma únicamente tras lectura fresca válida; devuelve eventId, no el email.")
    add("Guardar supresión","httpRequest",{"method":"POST","url":base+"!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      "authentication":"predefinedCredentialType","nodeCredentialType":"googleSheetsOAuth2Api","sendBody":True,
      "specifyBody":"json","jsonBody":"={{ JSON.stringify({values:[$json.row]}) }}","options":{"timeout":10000}},
      4.2,(1680,0),"Una única escritura RAW de seis campos mínimos. No reintenta un append ambiguo. Tanto éxito como error pasan a reconciliar mediante lectura fresca.",
      credentials=sheet_credentials,onError="continueRegularOutput")
    read("Releer supresión guardada",(1920,0),"Confirma el efecto real, no solo HTTP 200. Si se perdió la respuesta del append pero la baja está guardada, se confirma sin volver a añadirla.")
    add("Confirmar efecto de baja","code",{"jsCode":CONFIRM_JS},2,(2160,0),"Comprueba registro y dirección tras la escritura. Fallo/tabla alterada/ausencia de baja devuelve 503; no se miente sobre éxito.")
    condition("¿Baja confirmada?","ok",(2400,0),"Solo una supresión comprobada permite respuesta de éxito al worker. No ejecuta Gmail, Telegram ni cambios en otras filas.")
    respond("Confirmar baja nueva","={{ JSON.stringify({ok:true,eventId:$json.eventId,suppressed:true,duplicate:false}) }}",200,(2640,0),"200 con efecto persistido y eventId del evento solicitado; sin PII en la respuesta.")
    respond("No confirmar baja",'{"ok":false,"error":"suppression_unconfirmed"}',503,(2640,240),"503 mantiene el evento pendiente en el futuro outbox. No puede anunciarse una baja completada ni continuar con marketing.")
    connect("Recibir baja autenticada","Validar evento de baja")
    connect("Validar evento de baja","¿Evento válido?")
    connect("¿Evento válido?","Leer supresión actual")
    connect("¿Evento válido?","Rechazar evento",1)
    connect("Leer supresión actual","Preparar supresión")
    connect("Preparar supresión","¿Registro compatible?")
    connect("¿Registro compatible?","¿Baja ya registrada?")
    connect("¿Registro compatible?","No confirmar baja",1)
    connect("¿Baja ya registrada?","Confirmar baja existente")
    connect("¿Baja ya registrada?","Guardar supresión",1)
    connect("Guardar supresión","Releer supresión guardada")
    connect("Releer supresión guardada","Confirmar efecto de baja")
    connect("Confirmar efecto de baja","¿Baja confirmada?")
    connect("¿Baja confirmada?","Confirmar baja nueva")
    connect("¿Baja confirmada?","No confirmar baja",1)
    return {"id":WORKFLOW_ID,"name":"VARINO · 3 baja autenticada y supresión confirmada","active":False,
      "description":"Motor interno de baja: Header Auth → validar evento → leer Supresion → deduplicar o append RAW → releer efecto → responder. Sin correo ni endpoint GET público. Pendientes antes de marketing: tokens opacos, confirmación pública segura y cola durable. Credenciales en n8n; referencias placeholder; no activar todavía.",
      "nodes":nodes,"connections":edges,"settings":{"executionOrder":"v1","executionTimeout":60,
        "saveDataSuccessExecution":"none","saveDataErrorExecution":"none","saveManualExecutions":False,
        "saveExecutionProgress":False,"timezone":"Europe/Madrid"}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet-id",default="REPLACE_WITH_CRM_SHEET_ID")
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=build_workflow(args.sheet_id)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Built inactive authenticated suppression workflow; no execution or credential access.")


if __name__ == "__main__":
    main()
