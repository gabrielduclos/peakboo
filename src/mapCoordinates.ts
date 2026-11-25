export function mapCoordinates(part:string):{lat:number;lon:number}|null {
 try{
  const url=new URL(part);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  let coordinates:string[]=[];
  if(url.hostname==='www.google.com'&&url.pathname==='/maps/search/'&&url.searchParams.get('api')==='1')coordinates=(url.searchParams.get('query')||'').split(',');
  else if(url.hostname==='www.openstreetmap.org'&&url.pathname==='/')coordinates=[url.searchParams.get('mlat')||'',url.searchParams.get('mlon')||''];
  if(coordinates.length!==2||coordinates.some(v=>!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(v)))return null;
  const [lat,lon]=coordinates.map(Number);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
 }catch{return null}
}
