import {test,expect} from '@playwright/test';

const owner='part:microduck:e27cbdd6c07a264e';
const iface=(key:string)=>`interface:assembly:e27cbdd6c07a264e:${key}`;

test('原装对端识别与几何、紧固待核分开显示，并可跳转正确对端',async({page,request})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const catalog=await(await request.get('/api/workspaces')).json();
  const workspace=catalog.workspaces.find((w:{id:string})=>w.id==='microduck');
  const snapshot=workspace.snapshots.find((s:{packageVersion:string})=>s.packageVersion==='2.0.0-capabilities.9');
  expect(snapshot).toBeTruthy();
  await page.addInitScript(()=>localStorage.setItem('psop.workbench.inspector-width','390'));
  await page.goto('/#explorer?'+new URLSearchParams({workspace:'microduck',snapshot:snapshot.id,part:owner,detail:'interfaces',labels:'0',explode:'0'}));
  await expect(page.locator('[data-scene-ready=true]')).toBeVisible();
  await page.getByRole('tab',{name:'原装配',exact:true}).click();
  const row=(key:string)=>page.locator(`[data-assembly-interface="${iface(key)}"]`);
  await expect(row('shell_closure').locator('.assembly-use-state')).toHaveText('几何待核');
  await expect(row('shell_neck_minus').locator('.assembly-use-state')).toHaveText('几何待核');
  await expect(row('vertical_servo_fastening').locator('.assembly-use-state')).toHaveText('对端已识别');
  for(const key of ['shell_closure','shell_neck_minus','vertical_servo_fastening']){
    await expect(row(key).locator('.assembly-peer-links')).not.toContainText('待确认');
    await expect(row(key).locator('.assembly-peer-links')).not.toContainText('待核实');
    await expect(row(key)).toContainText('紧固细节待核');
  }
  await row('vertical_servo_fastening').locator('.assembly-interface-select').click();
  const assessment=page.locator('[data-reference-assessment="connection:assembly:e27cbdd6c07a264e:vertical_servo_fastening"]');
  await expect(assessment).toContainText('孔位已对应');
  await expect(assessment).toContainText('实际螺钉规格');
  await expect(assessment.locator('dl > div').filter({has:page.locator('dt',{hasText:'对端'})}).locator('dd')).toHaveText('已识别');
  await page.setViewportSize({width:390,height:844});
  await assessment.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.body.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1600,height:1000});
  await page.locator('.assembly-peer').getByRole('button',{name:'查看对端',exact:true}).click();
  await expect(page.locator('[data-active-assembly-interface]')).toHaveAttribute('data-active-assembly-interface','interface:assembly:a682dc3620df43f5:vertical_shell_receiver');
  expect(errors).toEqual([]);
});
