import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
const root=new URL("../public/",import.meta.url);
const names=["32","180","192","512","maskable-512","badge"];
// Stable source paths are available in development. Production URLs change with image bytes,
// while manifest identity and service-worker registration stay stable for installed PWAs.
export function pwaAssets(){
 return {
  name:"peakboo-pwa-assets",
  apply:"build",
  generateBundle:{
   order:"post",
   handler(_options,bundle){
    const versions=new Map();
    for(const name of names){
     const sourceName="peakboo-"+name+"-v2.png";
     const source=readFileSync(new URL(sourceName,root));
     const hash=createHash("sha256").update(source).digest("hex").slice(0,16);
     const fileName="pwa/peakboo-"+name+"-"+hash+".png";
     versions.set("/"+sourceName,"/"+fileName);
     this.emitFile({type:"asset",fileName,source});
     // Keep earlier install URLs valid, including notifications using the previous worker.
     if(["180","192","512"].includes(name))this.emitFile({type:"asset",fileName:"icon-"+name+".png",source});
    }
    const versionPaths=content=>{for(const [oldPath,newPath] of versions)content=content.replaceAll(oldPath,newPath);return content};
    for(const asset of Object.values(bundle)){
     if(asset.type==="asset"&&asset.fileName.endsWith(".html"))asset.source=versionPaths(typeof asset.source==="string"?asset.source:new TextDecoder().decode(asset.source));
    }
    for(const fileName of ["manifest.webmanifest","sw.js"])this.emitFile({type:"asset",fileName,source:versionPaths(readFileSync(new URL(fileName,root),"utf8"))});
   }
  }
 };
}
