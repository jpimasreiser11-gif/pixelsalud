#!/usr/bin/env python3
"""Prepare an inactive copy of reviewed VARINO mail graphs; never import/send.

Only manager references are accepted. Output must not exist; previous exports,
node IDs, notes, commercial consent and operational-mode checks are preserved.
"""
from __future__ import annotations
import argparse
import copy
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
import uuid

PREPARE = "Validar destinatario durable"
CHECK = "Comprobar baja durable"
AUTHORIZE = "Autorizar baja durable"
GATE = "¿Baja durable comprobada?"
NAMES = (PREPARE, CHECK, AUTHORIZE, GATE)
NODE_NOTES = {
    PREPARE: "Conserva el permiso previo y su caducidad. Compara el To RFC822 con la fila CRM ya reservada; rechaza destinatarios ocultos, manuales y mensajes cambiados.",
    CHECK: "Consulta el ledger primario justo antes de Gmail. Solo email; credencial dedicada en el gestor. Sin redirects ni retry. Ausencia de baja NO acredita consentimiento.",
    AUTHORIZE: "Solo HTTP 200 con objeto exacto suppressed:false permite continuar. Timeout/error/baja/datos ambiguos bloquean. No renueva el permiso anterior; resultado válido cinco segundos como máximo.",
    GATE: "Solo true alcanza Gmail; el resto conserva la reserva para revisión. No se reenvían efectos ambiguos.",
}
SENDER_NOTE = "Requiere además permiso durable vigente y el mismo RFC822 que se comprobó. No añadir nodos ni esperas entre este gate y Gmail."
UPSTREAM = "¿Envío autorizado ahora?"
SPECS = {
    "nurture": ("Enviar Gmail", "Aviso revisión nurture", "reservationRow", "Leads"),
    "followup": ("Enviar followup", "Aviso revisión seguimiento", "newRow", "Prospectos"),
}

PREPARE_JS = r"""
const ctx = $json;
const deny = () => { throw new Error('Recipient/current authorization invalid; manual review required'); };
const row = ctx.__ROW__;
const email = Array.isArray(row) ? String(row[2] ?? '').trim().toLowerCase() : '';
// Same supported address syntax as the ledger Recipient contract (Zod email).
// Lists, groups, comments and quoted/display-name syntax must not pass as one To.
const validEmail = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
if ($execution.mode !== 'production' || ctx.dispatchAuthorized !== true
    || !Number.isFinite(ctx.dispatchDeadline) || Date.now() >= ctx.dispatchDeadline
    || !validEmail.test(email) || email.length > 200
    || !/^__TABLE__!A(?:[2-9]|[1-9][0-9]+)$/.test(String(ctx.A1 ?? ''))
    || typeof ctx.raw !== 'string' || ctx.raw.length > 131072 || !/^[A-Za-z0-9_-]+$/.test(ctx.raw)) return deny();
try {
  const bytes = Buffer.from(ctx.raw, 'base64url');
  if (bytes.toString('base64url') !== ctx.raw) return deny();
  const message = bytes.toString('utf8');
  const boundary = message.indexOf('\r\n\r\n');
  if (boundary < 0) return deny();
  const lines = message.slice(0, boundary).split('\r\n');
  if (lines.some(line => !/^[A-Za-z0-9-]+: [^\r\n\x00-\x1f\x7f]*$/.test(line))) return deny();
  const recipients = lines.filter(line => /^To:/i.test(line));
  if (recipients.length !== 1 || recipients[0].slice(4).trim().toLowerCase() !== email
      || lines.some(line => /^(?:Cc|Bcc|Resent-[A-Za-z-]+):/i.test(line))) return deny();
} catch { return deny(); }
return {json:{...ctx,durableRecipient:email,durableCheckStartedAt:Date.now()}};
"""

AUTHORIZE_JS = r"""
const ctx = $('Validar destinatario durable').item.json;
const deny = () => ({json:{dispatchAuthorized:false,text:'VARINO · envío detenido: baja durable no comprobada. Revisión manual; sin reenvío automático.'}});
const body = $json.body;
const now = Date.now();
if ($execution.mode !== 'production' || ctx.dispatchAuthorized !== true
    || !Number.isFinite(ctx.dispatchDeadline) || now >= ctx.dispatchDeadline
    || !Number.isFinite(ctx.durableCheckStartedAt) || ctx.durableCheckStartedAt > now
    || now - ctx.durableCheckStartedAt > 10000
    || $json.error || $json.statusCode !== 200 || !body || Array.isArray(body)
    || typeof body !== 'object' || Object.keys(body).length !== 1
    || body.suppressed !== false) return deny();
return {json:{...ctx,durableSuppressionChecked:true,durableCheckedRaw:ctx.raw,
  durableSuppressionDeadline:Math.min(ctx.dispatchDeadline,now+5000)}};
"""

SEND_BODY = r"""={{ (() => {
  const now = Date.now();
  if ($execution.mode !== 'production' || $json.dispatchAuthorized !== true
      || !Number.isFinite($json.dispatchDeadline) || now >= $json.dispatchDeadline
      || $json.durableSuppressionChecked !== true
      || !Number.isFinite($json.durableSuppressionDeadline) || now >= $json.durableSuppressionDeadline
      || $json.durableSuppressionDeadline > $json.dispatchDeadline
      || typeof $json.raw !== 'string' || $json.raw !== $json.durableCheckedRaw) {
    throw new Error('Current commercial and durable suppression authorization required');
  }
  return JSON.stringify({raw:$json.raw});
})() }}"""

def control_origin(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != "varinoai.me" or parsed.port not in (None,443) \
            or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("Only the reviewed HTTPS VARINO control origin is accepted")
    return "https://varinoai.me"

def edges(graph):
    return [(source,index,edge["node"]) for source,connection in graph["connections"].items()
            for index,targets in enumerate(connection.get("main",[])) for edge in targets]

def patch_workflow(original, kind, origin="https://varinoai.me", credential_id="REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID"):
    origin = control_origin(origin)
    if credential_id != "REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID" and not re.fullmatch(r"(?:[A-Za-z0-9]{16}|[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})",credential_id):
        raise ValueError("Expected a credential manager reference, not a value")
    if kind not in SPECS:
        raise ValueError("Unsupported mail graph")
    graph = copy.deepcopy(original)
    nodes = {node["name"]:node for node in graph.get("nodes",[])}
    if len(nodes) != len(graph.get("nodes",[])) or any(name in nodes for name in NAMES):
        raise ValueError("Duplicate/previous gate nodes; review rather than overwrite")
    send,alert,row_key,table = SPECS[kind]
    if not all(name in nodes for name in (send,alert,UPSTREAM,"Autorizar envío actual")):
        raise ValueError("Missing existing operational/consent gate")
    if nodes[send]["type"] != "n8n-nodes-base.httpRequest" or nodes[send]["parameters"].get("method") != "POST" \
            or nodes[send]["parameters"].get("url") != "https://gmail.googleapis.com/gmail/v1/users/me/messages/send":
        raise ValueError("Unexpected Gmail destination")
    if [(source,index) for source,index,target in edges(graph) if target==send] != [(UPSTREAM,0)]:
        raise ValueError("Unreviewed alternate path to Gmail")
    if [(target) for source,index,target in edges(graph) if source==UPSTREAM and index==0] != [send]:
        raise ValueError("Unexpected sibling effect after commercial authorization")
    if any(n["name"] != send and "gmail.googleapis.com" in str(n.get("parameters",{}).get("url",""))
           and "/messages/send" in str(n.get("parameters",{}).get("url","")) for n in nodes.values()):
        raise ValueError("Unexpected additional Gmail sender")
    old_body = nodes[send]["parameters"].get("jsonBody", "")
    if "$execution.mode !== 'production'" not in old_body or "dispatchAuthorized" not in old_body or "dispatchDeadline" not in old_body:
        raise ValueError("Existing send safety checks missing")
    if "active" in graph and graph["active"] is not False:
        raise ValueError("Never rewrite an active export")
    graph["active"] = False
    settings = graph.setdefault("settings",{})
    settings.update(saveDataErrorExecution="none",saveDataSuccessExecution="none",saveManualExecutions=False,
                    saveExecutionProgress=False,executionOrder="v1")
    namespace = uuid.uuid5(uuid.NAMESPACE_URL,"varino:durable-mail-gate:"+str(graph.get("id",kind)))
    def node(name,ntype,parameters,version,position,notes):
        return {"id":str(uuid.uuid5(namespace,name)),"name":name,"type":ntype,"parameters":parameters,
                "typeVersion":version,"position":position,"notes":notes,"notesInFlow":False}
    prep = node(PREPARE,"n8n-nodes-base.code",{"mode":"runOnceForEachItem","jsCode":PREPARE_JS.replace("__ROW__",row_key).replace("__TABLE__",table)},2,[3200,-700],
                NODE_NOTES[PREPARE])
    check = node(CHECK,"n8n-nodes-base.httpRequest",{
        "method":"POST","url":origin+"/api/unsubscribe/check","authentication":"genericCredentialType","genericAuthType":"httpHeaderAuth",
        "sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify({email:$json.durableRecipient}) }}",
        "options":{"timeout":8000,"redirect":{"redirect":{"followRedirects":False}},"sendCredentialsOnCrossOriginRedirect":False,
                    "response":{"response":{"fullResponse":True,"neverError":True,"responseFormat":"json"}}}},4.2,[3440,-700],
        NODE_NOTES[CHECK])
    check.update(credentials={"httpHeaderAuth":{"id":credential_id,"name":"VARINO · consulta de oposición"}},onError="continueRegularOutput",retryOnFail=False)
    authorize = node(AUTHORIZE,"n8n-nodes-base.code",{"mode":"runOnceForEachItem","jsCode":AUTHORIZE_JS},2,[3680,-700],
                     NODE_NOTES[AUTHORIZE])
    gate = node(GATE,"n8n-nodes-base.if",{"conditions":{"options":{"caseSensitive":True,"typeValidation":"strict","version":2},
        "conditions":[{"id":"durable-clear","leftValue":"={{ $json.durableSuppressionChecked === true }}","rightValue":True,
                       "operator":{"type":"boolean","operation":"true","singleValue":True}}],"combinator":"and"},"options":{}},2.2,[3920,-700],
                NODE_NOTES[GATE])
    graph["nodes"].extend([prep,check,authorize,gate])
    graph["connections"][UPSTREAM]["main"][0] = [{"node":PREPARE,"type":"main","index":0}]
    def link(source,*targets):
        graph["connections"][source] = {"main":[[{"node":target,"type":"main","index":0}] for target in targets]}
    link(PREPARE,CHECK); link(CHECK,AUTHORIZE); link(AUTHORIZE,GATE); link(GATE,send,alert)
    nodes[send]["parameters"]["jsonBody"] = SEND_BODY
    nodes[send]["retryOnFail"] = False
    nodes[send]["notes"] = nodes[send].get("notes","") + "\n" + SENDER_NOTE
    assert [(source,index) for source,index,target in edges(graph) if target==send] == [(GATE,0)]
    assert all(node.get("notes") for node in (prep,check,authorize,gate))
    return graph

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--kind",choices=SPECS,required=True)
    parser.add_argument("--control-origin",default="https://varinoai.me")
    parser.add_argument("--check-credential-id",default="REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID")
    args = parser.parse_args()
    graph = patch_workflow(json.loads(args.input.read_text(encoding="utf-8")),args.kind,args.control_origin,args.check_credential_id)
    # No overwrite; never exports credential values or prints the graph/recipients.
    fd = os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as output:
        json.dump(graph,output,ensure_ascii=False,indent=2); output.write("\n")
    print("Prepared inactive copy; original/export IDs and prior consent gates preserved. No import, activation, credential creation or email.")

if __name__=="__main__":
    main()
