import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(dir) {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(['node_modules','dist','.git','docs','research-copy'].includes(entry.name)) continue;
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory()) result.push(...await files(path));
    else if(/\.(mjs|js)$/.test(entry.name)) result.push(path);
  }
  return result;
}
const paths=await files('.');
for(const path of paths) {
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(result.status!==0) { process.stderr.write(result.stderr); process.exit(1); }
}
console.log(`Syntax checked ${paths.length} JavaScript files`);
