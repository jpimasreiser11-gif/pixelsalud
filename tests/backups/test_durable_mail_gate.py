"""Offline native-node contracts; no accounts, contacts or external requests."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("durable_mail_gate", ROOT/"automation/n8n/add-durable-mail-gate.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

def fixture(kind):
    send,alert,_,_ = builder.SPECS[kind]
    names = [builder.UPSTREAM,"Autorizar envío actual",send,alert]
    nodes = [{"id":"existing-"+str(i),"name":name,"type":"n8n-nodes-base.code","parameters":{},
              "typeVersion":2,"position":[i*200,0],"notes":"Existing note, preserve it"} for i,name in enumerate(names)]
    sender = nodes[2]
    sender.update(type="n8n-nodes-base.httpRequest",typeVersion=4.2,parameters={"method":"POST",
      "url":"https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      "jsonBody":"={{ (()=>{ if($execution.mode !== 'production' || !$json.dispatchAuthorized || !$json.dispatchDeadline) throw Error();return JSON.stringify({raw:$json.raw}); })() }}"})
    return {"id":"fixture-"+kind,"active":False,"nodes":nodes,"connections":{
      builder.UPSTREAM:{"main":[[{"node":send,"type":"main","index":0}],[{"node":alert,"type":"main","index":0}]]}},"settings":{}}

class DurableMailGateTests(unittest.TestCase):
    def test_both_graphs_preserve_nodes_notes_false_branch_and_disable_storage(self):
        for kind in builder.SPECS:
            graph = fixture(kind); original = copy.deepcopy(graph)
            patched = builder.patch_workflow(graph,kind)
            self.assertEqual(graph,original)
            nodes = {n["name"]:n for n in patched["nodes"]}
            for previous in original["nodes"]:
                self.assertEqual(nodes[previous["name"]]["id"],previous["id"])
                self.assertTrue(nodes[previous["name"]]["notes"].startswith(previous["notes"]))
            self.assertEqual(patched["connections"][builder.UPSTREAM]["main"][1],original["connections"][builder.UPSTREAM]["main"][1])
            self.assertFalse(patched["active"])
            self.assertEqual(patched["settings"]["saveDataSuccessExecution"],"none")
            self.assertFalse(patched["settings"]["saveManualExecutions"])
            self.assertEqual([(s,i) for s,i,t in builder.edges(patched) if t==builder.SPECS[kind][0]],[(builder.GATE,0)])
            self.assertEqual(patched,builder.patch_workflow(graph,kind))
            http = nodes[builder.CHECK]
            self.assertEqual(http["credentials"]["httpHeaderAuth"]["id"],"REPLACE_WITH_SUPPRESSION_CHECK_CREDENTIAL_ID")
            self.assertFalse(http["parameters"]["options"]["redirect"]["redirect"]["followRedirects"])
            self.assertFalse(http["parameters"]["options"]["sendCredentialsOnCrossOriginRedirect"])
            self.assertFalse(http["retryOnFail"])

    def test_rejects_active_graph_unknown_paths_and_credential_values(self):
        graph=fixture("nurture")
        mutations=[]
        active=copy.deepcopy(graph); active["active"]=True; mutations.append(active)
        missing=copy.deepcopy(graph); missing.pop("active")
        self.assertFalse(builder.patch_workflow(missing,"nurture")["active"])
        unknown=copy.deepcopy(graph); unknown["active"]=None; mutations.append(unknown)
        bypass=copy.deepcopy(graph); bypass["connections"]["Bypass"]={"main":[[{"node":"Enviar Gmail","type":"main","index":0}]]}; mutations.append(bypass)
        sibling=copy.deepcopy(graph); sibling["connections"][builder.UPSTREAM]["main"][0].append({"node":"Otra escritura","type":"main","index":0}); mutations.append(sibling)
        for changed in mutations:
            with self.assertRaises(ValueError): builder.patch_workflow(changed,"nurture")
        with self.assertRaises(ValueError): builder.patch_workflow(builder.patch_workflow(graph,"nurture"),"nurture")
        for url in ["http://varinoai.me","https://attacker.test","https://varinoai.me/?key=bad","https://user@varinoai.me"]:
            with self.assertRaises(ValueError): builder.patch_workflow(graph,"nurture",url)
        for credential in ["Bearer not-a-reference","a"*43,"a"*64]:
            with self.assertRaises(ValueError): builder.patch_workflow(graph,"nurture",credential_id=credential)

    def test_native_javascript_denies_wrong_recipient_hidden_headers_and_ambiguous_check(self):
        for kind in builder.SPECS:
            _,_,row_key,table = builder.SPECS[kind]
            script = "const assert=require('node:assert/strict');\nconst prep=new Function('$json','$execution','Buffer',"+json.dumps(builder.PREPARE_JS.replace("__ROW__",row_key).replace("__TABLE__",table))+");\n"
            script += "const authorize=new Function('$json','$','$execution',"+json.dumps(builder.AUTHORIZE_JS)+");\n"
            script += "const send=new Function('$json','$execution','return ('+"+json.dumps(builder.SEND_BODY[3:-3])+"+')');\n"
            script += "const rowKey="+json.dumps(row_key)+", table="+json.dumps(table)+";\n"
            script += r"""
const execution={mode:'production'};
const raw=(to='qa@example.test',other='')=>Buffer.from('From: QA <agency@example.test>\r\nTo: '+to+'\r\n'+other+'Subject: QA\r\n\r\nSynthetic only').toString('base64url');
const ctx={raw:raw(),A1:table+'!A2',[rowKey]:['','', 'QA@example.test'],dispatchAuthorized:true,dispatchDeadline:Date.now()+30000};
const prepared=prep(ctx,execution,Buffer).json;
assert.equal(prepared.durableRecipient,'qa@example.test');
assert.equal(prepared.raw,ctx.raw);
const {z}=require('zod');
for(const email of ['qa+web@example.test',"o'reilly@example.test",'first.last@business.example.test']) {
  assert.equal(z.string().max(200).email().safeParse(email).success,true);
  assert.equal(prep({...ctx,[rowKey]:['','',email],raw:raw(email)},execution,Buffer).json.durableRecipient,email);
}
for(const email of ['a,b@example.test','group:a;@example.test','a(comment)@example.test','a@exa,mple.test',
  '.a@example.test','a..b@example.test','"a"@example.test','a@company.test:25']) {
  assert.equal(z.string().max(200).email().safeParse(email).success,false);
  assert.throws(()=>prep({...ctx,[rowKey]:['','',email],raw:raw(email)},execution,Buffer));
}
for(const bad of [{...ctx,raw:raw('other@example.test')},{...ctx,raw:raw('qa@example.test','Bcc: other@example.test\r\n')},
  {...ctx,raw:raw('qa@example.test','Cc: other@example.test\r\n')},{...ctx,raw:raw('qa@example.test','To: qa@example.test\r\n')},
  {...ctx,raw:raw('qa@example.test','Resent-To: other@example.test\r\n')},{...ctx,raw:ctx.raw+'='},
  {...ctx,dispatchDeadline:Date.now()-1},{...ctx,dispatchAuthorized:false}]) assert.throws(()=>prep(bad,execution,Buffer));
assert.throws(()=>prep(ctx,{mode:'manual'},Buffer));
const call=(response,current=prepared)=>authorize(response,()=>({item:{json:current}}),execution).json;
const good=call({statusCode:200,body:{suppressed:false}});
assert.equal(good.durableSuppressionChecked,true);
assert.ok(good.durableSuppressionDeadline<=Date.now()+5000);
assert.ok(good.durableSuppressionDeadline<=ctx.dispatchDeadline);
assert.deepEqual(JSON.parse(send(good,execution)),{raw:ctx.raw});
for(const response of [{statusCode:200,body:{suppressed:true}},{statusCode:200,body:{suppressed:'false'}},
  {statusCode:200,body:{suppressed:false,extra:true}},{statusCode:503,body:{suppressed:false}},
  {statusCode:302,body:{suppressed:false}},{statusCode:200,body:[]},{error:'unavailable'}])
  assert.equal(call(response).dispatchAuthorized,false);
for(const current of [{...prepared,dispatchDeadline:Date.now()-1},{...prepared,durableCheckStartedAt:Date.now()-10001},
  {...prepared,durableCheckStartedAt:Date.now()+10001}]) assert.equal(call({statusCode:200,body:{suppressed:false}},current).dispatchAuthorized,false);
for(const bad of [{...good,raw:raw('other@example.test')},{...good,durableSuppressionChecked:false},
  {...good,durableSuppressionDeadline:Date.now()-1},{...good,durableSuppressionDeadline:ctx.dispatchDeadline+1}]) assert.throws(()=>send(bad,execution));
assert.throws(()=>send(good,{mode:'manual'}));
"""
            result=subprocess.run(["node","-e",script],capture_output=True,text=True,timeout=15)
            self.assertEqual(result.returncode,0,result.stderr[-1500:])

    def test_command_creates_private_copy_without_overwriting_or_importing(self):
        with tempfile.TemporaryDirectory(prefix="varino-mail-gate-contract-") as directory:
            folder=Path(directory); original=folder/"input.json"; output=folder/"prepared.json"
            original.write_text(json.dumps(fixture("nurture")))
            args=["python3",str(ROOT/"automation/n8n/add-durable-mail-gate.py"),"--input",str(original),"--output",str(output),"--kind","nurture"]
            self.assertEqual(subprocess.run(args,capture_output=True).returncode,0)
            self.assertEqual(output.stat().st_mode & 0o777,0o600)
            saved=output.read_bytes()
            self.assertNotEqual(subprocess.run(args,capture_output=True).returncode,0)
            self.assertEqual(output.read_bytes(),saved)
            self.assertEqual(json.loads(original.read_text()),fixture("nurture"))

if __name__=="__main__": unittest.main()
