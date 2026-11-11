/** Refresh homepage capture entries and digests without replacing historical provenance. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'docs/html/assets');
const sourceFile=path.join(directory,'sources.json'),source=JSON.parse(await readFile(sourceFile,'utf8'));
const capture=JSON.parse(await readFile(path.join(directory,'workbench-capture.json'),'utf8'));
const entries=new Map(source.assets.map(entry=>[entry.file,entry]));
const captures=[['workbench-capture.json',capture,'scripts/capture-homepage.mjs']];
if(capture.video.connection_capture){
 const file=path.basename(capture.video.connection_capture);
 captures.push([file,JSON.parse(await readFile(path.join(directory,file),'utf8')),'scripts/capture-homepage-connection.mjs']);
}
for(const [file,record,script] of captures){
 if(record.package_digest!==capture.package_digest)throw Error('Inconsistent capture snapshot: '+file);
 for(const image of record.images)entries.set(image.file,{...image,role:image.purpose,source:script,source_capture:file,
  captured_at:record.captured_at,package_version:record.package_version,package_digest:record.package_digest,
  transform:'Actual Chromium UI screenshot encoded as WebP quality 0.94; no scene recoloring or geometry edits.'});
 entries.set(file,{file,source:script,kind:'actual_capture_manifest',role:'Actual screenshot, operation and movie provenance'});
}
entries.set(capture.video.file,{...capture.video,role:'Click-to-play head-shell connection, split, undo and full-device automatic assembly',
 source_captures:captures.map(([file])=>file),package_version:capture.package_version,package_digest:capture.package_digest});
if(capture.video.edit_recipe){
 const file=path.basename(capture.video.edit_recipe);
 entries.set(file,{file,source:'scripts/prepare-homepage-video.mjs',kind:'actual_recording_edit_recipe',
  role:'Source recording digests, visually checked raw-video timecodes and editorial captions'});
}
for(const entry of entries.values()){
 const bytes=await readFile(path.join(directory,entry.file));
 entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');
}
source.assets=[...entries.values()];source.updated_at=new Date().toISOString();
source.case_boundaries=source.case_boundaries.map(value=>value.startsWith('The assembly movie cuts')?
 'The assembly movie combines two isolated scenes from the same snapshot. The head-shell close-up hides the other 68 instances through native visibility controls. Waiting, camera adjustment and intermediate automatic-assembly footage are cut. Automatic playback is native 4x; scene and motions are real recordings.':value);
await writeFile(sourceFile,JSON.stringify(source,null,2)+'\n');
console.log('Updated '+source.assets.length+' asset records against actual files.');
