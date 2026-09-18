import express from "express";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

const app=express(), PORT=Number(process.env.PORT||3000);
const DATA=process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.DATA_DIR||"./data"; fs.mkdirSync(DATA,{recursive:true});
const stateFile=path.join(DATA,"state.json");
let state={}; try{state=JSON.parse(fs.readFileSync(stateFile,"utf8"))}catch{}
if(!state.jwtSecret){state.jwtSecret=crypto.randomBytes(48).toString("base64url");fs.writeFileSync(stateFile,JSON.stringify(state,null,2))}

const db=new Database(path.join(DATA,"panel.db"));
const SECRET=process.env.JWT_SECRET||state.jwtSecret;
const ADMIN_USER=process.env.ADMIN_USER||state.adminUser||"admin";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||state.adminPassword||"admin";

app.use(express.json({limit:"1mb"})); app.use(express.static("public"));

db.exec(`CREATE TABLE IF NOT EXISTS clients(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,protocol TEXT NOT NULL,uuid TEXT NOT NULL,
 password TEXT NOT NULL,enabled INTEGER DEFAULT 1,created_at TEXT NOT NULL
);`);
const auth=(req,res,next)=>{try{const h=req.headers.authorization||"";req.user=jwt.verify(h.replace(/^Bearer /,""),SECRET);next()}catch{res.status(401).json({error:"unauthorized"})}};
const uuid=()=>crypto.randomUUID();
function host(){return process.env.XRAY_PUBLIC_HOST||process.env.RAILWAY_TCP_PROXY_DOMAIN||"YOUR_TCP_PROXY_HOST"}
function pubPort(){return process.env.XRAY_PUBLIC_PORT||process.env.RAILWAY_TCP_PROXY_PORT||"YOUR_TCP_PROXY_PORT"}
function link(c){
 const h=host(),p=pubPort(),name=encodeURIComponent(c.name);
 if(c.protocol==="vless") return `vless://${c.uuid}@${h}:${p}?type=tcp&security=none#${name}`;
 if(c.protocol==="trojan") return `trojan://${encodeURIComponent(c.password)}@${h}:${p}?type=tcp&security=none#${name}`;
 const o={v:"2",ps:c.name,add:h,port:String(p),id:c.uuid,aid:"0",scy:"auto",net:"tcp",type:"none",host:"",path:"",tls:""};
 return "vmess://"+Buffer.from(JSON.stringify(o)).toString("base64");
}
function xrayConfig(){
 const clients=db.prepare("SELECT * FROM clients WHERE enabled=1").all();
 const vless=clients.filter(x=>x.protocol==="vless").map(x=>({id:x.uuid,email:x.name}));
 const vmess=clients.filter(x=>x.protocol==="vmess").map(x=>({id:x.uuid,alterId:0,email:x.name}));
 const trojan=clients.filter(x=>x.protocol==="trojan").map(x=>({password:x.password,email:x.name}));
 // one TCP port cannot demultiplex arbitrary raw VLESS/VMess/Trojan safely; choose protocol via XRAY_PROTOCOL
 const proto=process.env.XRAY_PROTOCOL||"vless";
 const settings=proto==="vless"?{clients:vless,decryption:"none"}:proto==="vmess"?{clients:vmess}:{clients:trojan};
 return {log:{loglevel:"warning"},inbounds:[{listen:"0.0.0.0",port:10000,protocol:proto,settings,streamSettings:{network:"tcp"}}],outbounds:[{protocol:"freedom",tag:"direct"}]};
}
function writeConfig(){fs.writeFileSync(path.join(DATA,"xray.json"),JSON.stringify(xrayConfig(),null,2))}
writeConfig();

app.get("/api/setup",(req,res)=>res.json({needsSetup:!state.adminPassword && !process.env.ADMIN_PASSWORD}));
app.post("/api/setup",(req,res)=>{if(state.adminPassword||process.env.ADMIN_PASSWORD)return res.status(409).json({error:"already setup"});const {username,password}=req.body||{};if(String(password||"").length<8)return res.status(400).json({error:"password must be 8+ chars"});state.adminUser=String(username||"admin").trim()||"admin";state.adminPassword=String(password);fs.writeFileSync(stateFile,JSON.stringify(state,null,2));res.json({ok:true})});
app.post("/api/login",(req,res)=>{const {username,password}=req.body||{};if(username!==(process.env.ADMIN_USER||state.adminUser||ADMIN_USER)||password!==(process.env.ADMIN_PASSWORD||state.adminPassword||ADMIN_PASSWORD))return res.status(401).json({error:"invalid credentials"});res.json({token:jwt.sign({sub:username},SECRET,{expiresIn:"12h"})})});
app.get("/api/status",auth,(req,res)=>res.json({service:"XRail Panel",xrayEnabled:process.env.ENABLE_XRAY==="true",protocol:process.env.XRAY_PROTOCOL||"vless",publicHost:host(),publicPort:pubPort(),clients:db.prepare("SELECT count(*) n FROM clients").get().n}));
app.get("/api/clients",auth,(req,res)=>res.json(db.prepare("SELECT id,name,protocol,uuid,enabled,created_at FROM clients ORDER BY created_at DESC").all()));
app.post("/api/clients",auth,(req,res)=>{let {name,protocol}=req.body||{};name=String(name||"").trim();if(!name||!["vless","vmess","trojan"].includes(protocol))return res.status(400).json({error:"bad input"});const c={id:uuid(),name,protocol,uuid:uuid(),password:crypto.randomBytes(18).toString("base64url"),enabled:1,created_at:new Date().toISOString()};db.prepare("INSERT INTO clients VALUES(@id,@name,@protocol,@uuid,@password,@enabled,@created_at)").run(c);writeConfig();res.json({...c,link:link(c)})});
app.patch("/api/clients/:id",auth,(req,res)=>{const enabled=req.body.enabled?1:0;db.prepare("UPDATE clients SET enabled=? WHERE id=?").run(enabled,req.params.id);writeConfig();res.json({ok:true})});
app.delete("/api/clients/:id",auth,(req,res)=>{db.prepare("DELETE FROM clients WHERE id=?").run(req.params.id);writeConfig();res.json({ok:true})});
app.get("/api/clients/:id/link",auth,(req,res)=>{const c=db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);if(!c)return res.sendStatus(404);res.json({link:link(c)})});
app.get("/api/clients/:id/qr",auth,async(req,res)=>{const c=db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);if(!c)return res.sendStatus(404);res.json({dataUrl:await QRCode.toDataURL(link(c),{margin:1,width:320})})});
app.get("/sub/:id",(req,res)=>{const c=db.prepare("SELECT * FROM clients WHERE id=? AND enabled=1").get(req.params.id);if(!c)return res.sendStatus(404);res.type("text/plain").send(Buffer.from(link(c)+"\n").toString("base64"))});
app.get("/api/clients/:id/sub",auth,(req,res)=>{const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");res.json({url:`${base}/sub/${req.params.id}`})});
app.get("/health",(req,res)=>res.json({ok:true}));
app.listen(PORT,"0.0.0.0",()=>console.log(`XRail Panel listening on ${PORT}`));
