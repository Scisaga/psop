import {Focus,Pause,Play,SkipForward} from 'lucide-react';
import type {AutomaticAssemblyProgress} from './simulate-types';

export default function SimulationAutoAssemblyHUD({progress,onPause,onSpeed,onSkip,onCameraFollow}:{progress:AutomaticAssemblyProgress;onPause:()=>void;onSpeed:(speed:number)=>void;onSkip:()=>void;onCameraFollow:(enabled:boolean)=>void}){
 const chapter=progress.phase==='reveal'?'组装完成':progress.path_status==='reference_only'?'部件安装':progress.chapter,label=progress.phase==='reveal'?'全部部件已归位':progress.label.replace(/ · 参考构型示意$/,'');
 return <section className="simulation-auto-player simulation-hud" role="region" aria-label="自动组装进度" data-auto-phase={progress.phase} data-auto-step={progress.step} data-auto-step-progress={progress.step_progress.toFixed(3)} data-auto-paused={progress.paused}>
  <div className="simulation-auto-controls">
   <div className="simulation-auto-caption"><Play size={13}/><div><strong>{progress.paused?'已暂停':chapter}</strong><span title={label}>{progress.phase==='reveal'?'全部部件已归位':label}</span></div><small>{Math.round(progress.progress*100)}%</small></div>
   <div className="simulation-auto-track" role="progressbar" aria-label="自动组装进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress*100)}><span style={{width:progress.progress*100+'%'}}/></div>
   <div className="simulation-auto-transport"><span>鼠标旋转 · 右键平移 · 滚轮缩放</span><button aria-label="跟随装配视角" aria-pressed={progress.camera_follow} title="自动选择装配特写；拖动视口恢复自由观察" onClick={()=>onCameraFollow(!progress.camera_follow)}><Focus size={14}/></button><button aria-label={progress.paused?'继续自动组装动画':'暂停自动组装动画'} onClick={onPause} title="Space 暂停／继续">{progress.paused?<Play size={13}/>:<Pause size={13}/>}</button><button aria-label="动画播放速度" onClick={()=>onSpeed(progress.speed===1?2:progress.speed===2?4:1)}>{progress.speed}×</button><button aria-label="跳过自动组装动画" onClick={onSkip} title="Esc 完成组装"><SkipForward size={14}/></button></div>
  </div>
 </section>;
}
