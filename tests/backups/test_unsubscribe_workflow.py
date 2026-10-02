"""Offline graph/Code regressions; native execution is a separate opt-in drill."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("unsubscribe_builder",ROOT/"automation/n8n/build-unsubscribe.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def execute(js,payload,ctx=None):
    script="const $json="+json.dumps(payload)+";const ctx="+json.dumps(ctx)+";"
    script+="const $input={first:()=>({json:$json})};const $=()=>({first:()=>({json:ctx})});"
    script+="process.stdout.write(JSON.stringify(new Function('$json','$input','$',"+json.dumps(js)+")($json,$input,$)));"
    return json.loads(subprocess.run(["node","-e",script],check=True,capture_output=True,text=True).stdout)[0]["json"]


class UnsubscribeTests(unittest.TestCase):
    def setUp(self):
        self.event={"email":"QA@agency.test","eventId":"a"*64,"requestedAt":"2026-01-01T00:00:00Z"}
        self.ctx={**self.event,"email":"qa@agency.test","requestedAt":"2026-01-01T00:00:00.000Z","valid":True}

    def test_payload_is_strict_and_timestamps_are_real(self):
        self.assertTrue(execute(builder.VALIDATE_JS,{"body":self.event})["valid"])
        self.assertTrue(execute(builder.VALIDATE_JS,{"body":{**self.event,"requestedAt":"2026-01-01T00:00:00.123Z"}})["valid"])
        for change in ({"email":"qa\r\nBcc:bad@agency.test"},{"email":"qa@agency.test "},
                       {"eventId":"legacy-base64-email"},{"email":"https://agency.test"},
                       {"requestedAt":"2026-02-30T00:00:00Z"},{"requestedAt":"2026-01-01"},
                       {"requestedAt":"2999-01-01T00:00:00Z"},{"debug":"unexpected"}):
            self.assertFalse(execute(builder.VALIDATE_JS,{"body":{**self.event,**change}})["valid"],change)

    def test_exact_headers_and_rows_are_required(self):
        value=execute(builder.PREPARE_JS,{"values":[builder.HEADERS]},self.ctx)
        self.assertTrue(value["available"])
        self.assertFalse(value["suppressed"])
        self.assertEqual(value["row"],["qa@agency.test","email","baja",self.ctx["requestedAt"],"baja-confirmada-v1","a"*64])
        for payload in ({"error":"offline"},{"values":[]},{"values":[["email"]]},
                        {"values":[builder.HEADERS,["invalid","email"]]},
                        {"values":[builder.HEADERS,["qa@agency.test","sms"]]},
                        {"values":[builder.HEADERS,"not a row"]}):
            self.assertFalse(execute(builder.PREPARE_JS,payload,self.ctx)["available"])

    def test_existing_opposition_cannot_be_overridden_by_new_event(self):
        payload={"values":[builder.HEADERS,["QA@agency.test","email","respuesta","2025-01-01","reply","old-event"]]}
        self.assertTrue(execute(builder.PREPARE_JS,payload,self.ctx)["suppressed"])
        self.assertTrue(execute(builder.CONFIRM_JS,payload,self.ctx)["ok"])
        self.assertEqual(execute(builder.CONFIRM_JS,payload,self.ctx)["eventId"],"a"*64)

    def test_append_acknowledgement_is_not_proof_of_baja(self):
        for payload in ({"updates":{"updatedRows":1}},{"values":[builder.HEADERS]},
                        {"error":"lost read"},{"values":[["wrong"],["qa@agency.test","email"]]}):
            self.assertFalse(execute(builder.CONFIRM_JS,payload,self.ctx)["ok"])

    def test_export_is_inactive_authenticated_and_has_no_mail(self):
        flow=builder.build_workflow("synthetic_crm_id")
        self.assertFalse(flow["active"])
        self.assertEqual(flow["id"],builder.WORKFLOW_ID)
        webhook=next(node for node in flow["nodes"] if node["type"]=="n8n-nodes-base.webhook")
        self.assertEqual(webhook["parameters"]["httpMethod"],"POST")
        self.assertEqual(webhook["parameters"]["authentication"],"headerAuth")
        self.assertEqual(webhook["parameters"]["responseMode"],"responseNode")
        self.assertEqual(len(flow["nodes"]),15)
        self.assertEqual(len({node["id"] for node in flow["nodes"]}),15)
        self.assertEqual(len({tuple(node["position"]) for node in flow["nodes"]}),15)
        for node in flow["nodes"]:
            self.assertTrue(node["notes"])
            self.assertFalse(node["notesInFlow"])
            self.assertNotIn("gmail",node["type"].lower())
            self.assertFalse(node.get("retryOnFail",False))
            for credential in node.get("credentials",{}).values():
                self.assertTrue(credential["id"].startswith("placehold_"))
                self.assertEqual(set(credential),{"id","name"})
        self.assertEqual(flow["settings"]["saveDataSuccessExecution"],"none")
        self.assertEqual(flow["settings"]["saveDataErrorExecution"],"none")
        self.assertFalse(flow["settings"]["saveManualExecutions"])
        for source,outputs in flow["connections"].items():
            self.assertIn(source,{node["name"] for node in flow["nodes"]})
            for branch in outputs["main"]:
                for edge in branch:
                    self.assertIn(edge["node"],{node["name"] for node in flow["nodes"]})

    def test_generator_is_deterministic_and_rejects_arbitrary_urls(self):
        self.assertEqual(builder.build_workflow("synthetic_crm_id"),builder.build_workflow("synthetic_crm_id"))
        self.assertEqual(json.loads((ROOT/"automation/n8n/3-unsubscribe.template.json").read_text()),
                         builder.build_workflow("REPLACE_WITH_CRM_SHEET_ID"))
        for invalid in ("", "https://evil.test", "id\nheader", "id?query=unsafe"):
            with self.assertRaises(ValueError):
                builder.build_workflow(invalid)


if __name__=="__main__":
    unittest.main()
