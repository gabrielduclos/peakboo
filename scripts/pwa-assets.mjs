import {deflateSync} from "node:zlib";
// Build deterministic PNG icons from the app's P/B monogram, with a maskable safe area.
const crc=b=>{let n=0xffffffff;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0};
const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,data])),8+data.length);return out};
function icon(size){
 const raw=Buffer.alloc(size*(size*4+1)),h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;
 const P=["1110","1001","1001","1110","1000","1000","1000"],B=["1110","1001","1001","1110","1001","1001","1110"];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4,xx=(x/size-.22)/.062,yy=(y/size-.282)/.062;
  const col=Math.floor(xx),row=Math.floor(yy);
  let color=[247,250,251];if(row>=0&&row<7&&col>=0&&col<4&&P[row][col]==="1")color=[0,160,131];
  if(row>=0&&row<7&&col>=5&&col<9&&B[row][col-5]==="1")color=[71,123,181];
  raw[i]=color[0];raw[i+1]=color[1];raw[i+2]=color[2];raw[i+3]=255;
 }
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",h),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}
export function pwaAssets(){return {name:"peakboo-pwa-assets",generateBundle(){for(const size of [192,512,180])this.emitFile({type:"asset",fileName:"icon-"+size+".png",source:icon(size)})}}}
