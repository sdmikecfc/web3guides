"""Source-coordinate diagrams for review. These are not final Blender exports."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

def svg(body, caption):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 640"><rect width="1120" height="640" fill="#f4f1e9"/><g stroke="#344347" stroke-width="2" fill="none">'+body+'</g><text x="35" y="42" font-family="sans-serif" font-size="24" fill="#263337">'+caption+'</text><text x="35" y="615" font-family="sans-serif" font-size="14" fill="#566064">Source layout review · Y up / camera at +Z · Human approval pending</text></svg>'

for variant in ("garage", "community"):
    folder = ROOT / f"{variant}-v2"
    brief = json.loads((folder / "room-brief.json").read_text())
    layout = json.loads((folder / "room-layout.json").read_text())
    brief["boundsMeters"] = [40, 12, 23] if variant == "garage" else [48, 10.24, 28]
    brief["symmetry"]["appliesTo"] = ["five desktop display anchors", "room substrate"]
    brief["symmetry"]["exceptions"] = ["The shallow 3D corkboard is left; the original backdrop depicts tools, shelves and a workbench at the edges." if variant == "garage" else "Three photographic workshops on either side frame the recessed arena; visitors keep independent saved builds.", "Mobile places three robots behind two foreground robots.", "Player builds retain genuine silhouette and size differences."]
    brief["artifacts"].update(floorPlan="plans/desktop-layout.svg", wallElevations=["plans/front-elevation.svg"])
    brief["unitsNote"] = "Scene uses authored robot units. Values labelled metres are source coordinates, not life-size manufacturing measurements."
    layout["surfaces"] = [{"id":"shadow-ground","center":[0,.006,5],"dimensions":[40,0,40],"supportNormal":[0,1,0],"material":"ShadowMaterial; physical shadow receiver over photographic floor"}]
    if variant == "garage":
        layout["surfaces"] += [{"id":"back-wall-projection","center":[0,6,-4],"dimensions":[32,12,0],"supportNormal":[0,0,1],"texture":"/bots-art/plates/workshop-interior.png","uvRepeat":[1,.667],"uvOffset":[0,.333]}, {"id":"floor-projection","center":[0,-.004,7.5],"dimensions":[40,0,23],"supportNormal":[0,1,0],"texture":"/bots-art/plates/workshop-interior.png","uvRepeat":[1,.333],"uvOffset":[0,0]}]
    else:
        layout["surfaces"] += [{"id":"left-workshop-projection","center":[-11.3,5.12,-6],"dimensions":[17.5,10.24,0],"supportNormal":[0,0,1],"texture":"/bots-art/plates/street-elevation.webp","uvRepeat":[3/7,.50],"uvOffset":[0,.28]}, {"id":"right-workshop-projection","center":[11.3,5.12,-6],"dimensions":[17.5,10.24,0],"supportNormal":[0,0,1],"texture":"/bots-art/plates/street-elevation.webp","uvRepeat":[3/7,.50],"uvOffset":[4/7,.28]}, {"id":"floor-projection","center":[0,-.004,8],"dimensions":[48,0,28],"supportNormal":[0,1,0],"texture":"/bots-art/plates/street-elevation.webp","uvRepeat":[1,.28],"uvOffset":[0,0]}, {"id":"recessed-arena-projection","center":[0,2.35,-10],"dimensions":[5.6,4.7,0],"supportNormal":[0,0,1],"texture":"/bots-art/plates/arena-evening.png","uvRepeat":[.43,1],"uvOffset":[.285,0]}]
    for i, instance in enumerate(layout["instances"]):
        instance["id"] = f"{'stand' if variant == 'garage' else 'visitor'}-{i+1}"
        instance["center"] = [(i-2)*(4.4 if variant == "garage" else 5), 0, 1.5 if variant == "garage" else 1+(i%2)*.8]
        instance["topY"] = .44 if variant == "garage" else 0
        if variant == "community":
            instance["dimensions"] = [3.8,5.3,3.4]
            instance["role"] = "Clickable robot at original unit scale; recorded replay or labelled practice action"
    layout["mobile"] = {"positions":[[-4.05,0,-.8],[0,0,-.8],[4.05,0,-.8],[-2.25,0,9.5],[2.25,0,9.5]],"camera":[.6,16.5,27],"target":[0,2,2.6],"minimumHorizontalUnits":13,"minimumVerticalUnits":14 if variant=="garage" else 16}
    layout["dressing"] = ["original warm workshop art projected across a wall and floor", "five physical wheeled metal stands with brass number plates and trolley handles", "shallow 3D left corkboard with notes", "real shared shadows over the projected floor"] if variant == "garage" else ["original street concept projected onto two workshop facades and a floor", "recessed arena at z=-10 behind frontage at z=-6", "3D portal posts, trim, threshold and bulbs", "ARENA sign with exact local text", "real shared shadows over the projected street"]
    layout["projectionNotes"] = "This fixed-camera 2.5D set uses existing high-quality artwork as visual dressing; toys, trolleys, contact shadows and selected foreground features are real 3D. The floor split changes its visible horizon correctly with the phone camera. Backdrop image planes are not complete sculpted room meshes."
    layout["lighting"]={"environment":"Three.js RoomEnvironment","keyPosition":[8,13,9],"keyIntensity":3.4,"keyColour":"#ffdba6","fillIntensity":.62,"rimIntensity":1.15,"toneMapping":"ACESFilmic","exposure":.96,"shadowMapSize":1024,"shadowType":"PCF","shadowRadius":2.6,"shadowOpacity":.23,"poseHz":12,"cameraRenderTargetHz":60}
    layout["limitations"] = ["Projected backdrops limit future free-camera exploration; this preview uses fixed production cameras.","Foreground forms and projected room art await human Form approval; there is no final Blender room export.","Room navigation is menu driven; there is no avatar walkthrough.","No physical mobile performance result is available."]
    save(folder / "room-brief.json", brief)
    save(folder / "room-layout.json", layout)
    scale=25
    def point(x,z): return 560+x*scale, 305+z*scale
    def rect(x,z,w,d):
        px,pz=point(x-w/2,z-d/2)
        return f'<rect x="{px:.2f}" y="{pz:.2f}" width="{w*scale:.2f}" height="{d*scale:.2f}"/>'
    def label(x,z,s):
        px,pz=point(x,z)
        return f'<text x="{px}" y="{pz}" font-family="sans-serif" font-size="16" text-anchor="middle" stroke="none" fill="#344347">{s}</text>'
    body=rect(0,2,31,18)
    if variant=="garage":
        body+=rect(0,-4,32,.05)
        body+=rect(-10.55,-3.72,2.5,.17)+label(-10.55,-4.8,"3D corkboard")+label(9.5,-3,"Projected tools and shelves")
    else:
        body+=rect(-11.3,-6,17.5,.05)+rect(11.3,-6,17.5,.05)
        body+=rect(0,-10,5.6,.05)+rect(-2.74,-8,.48,4.5)+rect(2.74,-8,.48,4.5)+label(0,-7,"Arena recess")
    for i,instance in enumerate(layout["instances"]):
        x,_,z=instance["center"]
        body+=rect(x,z,3.22,2.2)+label(x,z+.2,str(i+1))+label(x,z+1.8,"Robot clearance")
    body+=label(0,9.7,"Shared front camera / five accessible selection buttons")
    (folder/"plans/desktop-layout.svg").write_text(svg(body,f"{variant.title()} · desktop layout"),encoding="utf-8")
    body=rect(0,4.4,13,14)
    for i,(x,_,z) in enumerate(layout["mobile"]["positions"]):
        body+=rect(x,z,3.22,2.2)+label(x,z+.15,str(i+1))
    body+=label(0,5,"Clear sightline between rows")
    (folder/"plans/mobile-layout.svg").write_text(svg(body,f"{variant.title()} · phone layout"),encoding="utf-8")
    body='<rect x="95" y="110" width="930" height="320"/>'
    for i in range(5):
        x=176+i*184
        body+=f'<rect x="{x-52}" y="426" width="104" height="15"/><rect x="{x-48}" y="228" width="96" height="192" stroke-dasharray="5 5"/><text x="{x}" y="471" text-anchor="middle" font-family="sans-serif" font-size="18" stroke="none" fill="#344347">{i+1}</text>'
    body+='<text x="560" y="527" text-anchor="middle" font-family="sans-serif" font-size="18" stroke="none" fill="#344347">Dashed silhouettes reserve clearance; actual saved parts determine shape.</text>'
    (folder/"plans/front-elevation.svg").write_text(svg(body,f"{variant.title()} · front clearance elevation"),encoding="utf-8")
    metadata={"schema":"game-room.plan-metadata.v1","roomId":brief["roomId"],"style":"monochrome-engineering","projectionSource":"source-coordinate diagram","layers":["floor plan","mobile plan","front clearance elevation"],"semanticLabelsOutsideImage":False,"aiInspirationIncluded":True,"aiInspirationReason":"Original user-approved concept art is retained as the target, separately from deterministic diagrams.","coverage":["plans/desktop-layout.svg","plans/mobile-layout.svg","plans/front-elevation.svg"],"limitations":"These are coordinate diagrams, not a Blender mesh multi-view audit."}
    save(folder/"plan-metadata.json",metadata)
    props=json.loads((folder/"props.json").read_text())
    props["generation"]={"provider":"none","apiModel":None,"pricingSource":None,"pricingVerifiedAt":None,"creditsPerTexturedTask":0,"hardCreditCeiling":0,"maxChargedAttemptsPerAsset":0,"notes":"No paid generation. Review forms are authored in the local Three.js module and are not final runtime exports."}
    props["assets"]=[{"id":f"{variant}-{i+1}","name":name,"source":"../../../../src/app/bots/_view/living-room.ts","status":"projected art and 3D review form","approved":False} for i,name in enumerate(layout["dressing"])]
    save(folder/"props.json",props)
    openings=json.loads((folder/"openings.json").read_text())
    if variant=="community":
        openings["openings"]=[{"id":"arena-portal","center":[0,2.35,-5.75],"clearWidth":5.04,"clearHeight":4.65,"depth":4.25,"assembly":"Separate 3D posts, header and threshold in front of a recessed arena image; no Boolean operation.","role":"Arena destination in the display set; not an avatar navigation portal.","verifiedInFinalBlenderMesh":False}]
    save(folder/"openings.json",openings)
    contact=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{variant.title()} layout review</title><style>body{{background:#211c17;color:#f1e2c7;font:16px system-ui;margin:24px}}main{{max-width:1200px;margin:auto}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}}figure{{margin:0;background:#392e23;border:1px solid #806744;border-radius:12px;overflow:hidden}}img{{width:100%;display:block}}figcaption{{padding:14px;line-height:1.5}}a{{color:#f2c57f}}p{{line-height:1.6}}</style><main><h1>{variant.title()}: layout and reference review</h1><p>The original concept remains the visual target. These diagrams describe the new shared 3D room. The live preview uses the actual game robots. Layout and Form approvals are pending; nothing here is a final Blender export.</p><p><a href="http://127.0.0.1:3000/bots/rooms/review">Open the interactive Form preview</a> · Select {variant.title()} and compare desktop with Phone frame.</p><div class="grid"><figure><img src="../../concept/{'1-garage.png' if variant=='garage' else '5-street.png'}" alt="Original concept"><figcaption>Original concept reference: warm, handmade collectible-toy styling.</figcaption></figure><figure><img src="plans/desktop-layout.svg" alt="Desktop source layout"><figcaption>Source layout: five robots, shared camera and physical support. Furniture leaves the robot silhouettes clear.</figcaption></figure><figure><img src="plans/mobile-layout.svg" alt="Mobile source layout"><figcaption>Phone layout: three robots behind two. Units and robot proportions remain unchanged.</figcaption></figure><figure><img src="plans/front-elevation.svg" alt="Front clearance diagram"><figcaption>Front clearance envelopes. The live Form preview is the evidence for actual shapes, shadows and contact.</figcaption></figure></div><p>Review limits: props are procedural forms; a complete multi-angle Blender shell audit and authored eyelid animation remain outstanding. Desktop browser telemetry does not certify performance on a physical phone.</p></main></html>'''
    captures="".join(f'<figure><img src="renders/{variant}-{size}-form.png" alt="Actual {size} Form preview"><figcaption>Actual game screenshot: {size}. Human Form approval is pending.</figcaption></figure>' for size in ("desktop","mobile") if (folder/f"renders/{variant}-{size}-form.png").exists())
    contact=contact.replace('<div class="grid">','<div class="grid">'+captures)
    contact=contact.replace('Review limits: props are procedural forms; a complete multi-angle Blender shell audit and authored eyelid animation remain outstanding.','Review limits: existing room artwork is projected onto physical wall and floor planes, while robots, trolleys, portal framing and shared shadows are 3D. This fixed-camera set does not support a free camera through every workshop. A complete Blender export and authored eyelid animation remain outstanding.')
    (folder/"contact-sheet.html").write_text(contact,encoding="utf-8")
    report=json.loads((folder/"final-report.json").read_text())
    report["reviewRenders"]["gameFrames"]=[f"renders/{variant}-{size}-form.png" for size in ("desktop","mobile")]
    report["runtimeChecks"]["browserCapture"]=f"renders/{variant}-desktop-form.png"
    report["postmortem"]["observations"]=["The preview uses one shared camera, physical floor and original unit-scale robot meshes.",layout["projectionNotes"],"Existing room plates are reused without paid generation or destructive edits. Static geometry is batched by material; room actors use fight-detail meshes and no dent geometry."]
    report["postmortem"]["corrections"]=["Replaced the rejected flat procedural set dressing with the original high-quality room artwork projected onto real planes.","Matched warm key light, reduced fill and softened shared floor shadows.","Reserved the phone rows and compact clipboard space so robots remain visible."]
    report["postmortem"]["remainingRisks"]=["Human layout and Form approvals remain pending.","The projected room does not permit arbitrary camera travel through background workshops.","No final Blender scene or exported texture tiers have been created.","Physical-mobile performance is untested; short desktop browser samples are not a sustained benchmark.","Existing GLB rigs do not include authored eyelids; restrained head and torso movement is present but genuine blinks remain outstanding."]
    save(folder/"final-report.json",report)


# Preserve explicit visual-direction acceptance across source-plan regeneration.
for _variant in ("garage", "community"):
    _folder = ROOT / f"{_variant}-v2"
    _record = _folder / "visual-direction-approval.json"
    if not _record.exists():
        continue
    _review = json.loads(_record.read_text(encoding="utf-8"))
    if _review.get("status") != "accepted":
        continue
    _message = 'Visual layout/Form direction accepted on 2026-09-10 after the user said "keep going please". Final Blender, export and runtime audits remain open.'
    for _name in ("room-layout.json", "final-report.json", "props.json", "openings.json"):
        _path = _folder / _name
        _value = json.loads(_path.read_text(encoding="utf-8"))
        _value["visualDirectionReview"] = _review
        if _name == "room-layout.json":
            _value["status"] = "accepted visual direction; source composition; final technical audits pending"
            _value["limitations"] = [_message if "await human Form approval" in x else x for x in _value["limitations"]]
        elif _name == "final-report.json":
            _value["postmortem"]["remainingRisks"] = [_message if x == "Human layout and Form approvals remain pending." else x for x in _value["postmortem"]["remainingRisks"]]
        elif _name == "openings.json":
            _value["status"] = "accepted visual direction; final Blender opening verification pending"
        save(_path, _value)
    for _path in [_folder / "contact-sheet.html", *(_folder / "plans").glob("*.svg")]:
        _text = _path.read_text(encoding="utf-8")
        _text = _text.replace("Layout and Form approvals are pending; nothing here is a final Blender export.", _message)
        _text = _text.replace("Human Form approval is pending.", "Visual direction accepted on 10 September 2026; technical audits remain open.")
        _text = _text.replace("Human approval pending", "Visual direction accepted / technical audit open")
        _path.write_text(_text, encoding="utf-8")
