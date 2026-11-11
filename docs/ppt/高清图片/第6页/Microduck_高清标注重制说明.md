# Microduck 高清标注图重制

2026-09-18。使用内置 imagegen 编辑原标注图片，生成 1536×1024 高清底图；移除左下角“Microduck · 设备标注示意”，保留右下角标注工具栏。底图为 `Microduck_高清底图.png`。

在现有 PPT 第 6 内容页（实际第 7 张）以独立原生对象重新添加“头部相机、腿部关节、足部组件”三组中文标签、检测框及角点。标签不再嵌入底图，修改字体和缩放时可保持清晰。其余页面布局和内容保持不变。

`Microduck_高清标注图.png` 是带标注的 PowerPoint 实际渲染，1536×1013，与既有图片框的比例一致。PPT 内仍采用底图加 21 个独立标注对象，未合并为一张图片。

## 内置 imagegen 使用的完整提示词

```text
Use case: precise-object-edit / high-resolution restoration.
Input image 1 is the EDIT TARGET: the user's selected Microduck equipment annotation photograph. Output ONLY the equipment photograph, not a slide or screenshot of PowerPoint.
Recreate this exact photograph in crisp high definition, landscape 3:2 aspect ratio, ideally 3072x2048 pixels. Preserve the same robot identity, pose, framing, proportions, camera angle, workbench and workshop backdrop. Keep the cream white head casing, orange beak trim, single black head camera in an orange circular mount, articulated black neck, white/gray body and joints, black legs and two orange feet. The entire head and both feet remain in frame in the same approximate positions. Restore sharp mechanical details and smooth clean edges, with realistic materials and moderate background depth of field. Do not invent additional components or change the device.
REMOVE every detection overlay: the lime and cyan bounding boxes, their corner handles, and all three colored Chinese labels. REMOVE the entire bottom-left green pill that says "Microduck · 设备标注示意"; restore continuous realistic tabletop behind it, with NO replacement text or watermark.
REMOVE the outer PowerPoint selection border and all white circular selection handles. The final image must be edge-to-edge photography without a surrounding frame.
KEEP ONLY the existing bottom-right translucent dark teal annotation toolbar, in the same lower-right position, with four crisp simple line icons: white left arrow, yellow pencil, white plus, white sliders. No text on the toolbar.
There must be NO Chinese characters, NO Latin letters, NO labels, NO detection boxes anywhere in the output. The three Chinese labels and boxes will be added later as editable PowerPoint objects. High-resolution sharp subject; avoid blurred or painterly reconstruction.
```
