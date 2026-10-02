"""Original metal-fighter silhouettes for a separate local choreography study.

Run with installed Blender 4.5. Only writes the explicitly supplied output root.
Geometry is authored directly in Y-up game coordinates. GLB export_yup=False
preserves those coordinates and every named rig node's identity bind rotation.
No downloaded geometry, paid generation, old character forms, or game changes.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--hero', choices=['bastion', 'vesper', 'all'], default='all')
parser.add_argument('--no-render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
OUT = args.output.resolve()
ASSETS, ART = OUT / 'assets', OUT / 'art'
for directory in [ASSETS, ART, ART / 'textures', ART / 'review']:
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
NODES, MARKERS, MATERIALS = {}, {}, {}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reset():
    global NODES, MARKERS, MATERIALS
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.data.orphans_purge(do_recursive=True)
    NODES, MARKERS, MATERIALS = {}, {}, {}


def vec(value):
    return [round(float(x), 8) for x in value]


def node(name, position, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (1, 0, 0, 0)
    if parent:
        obj.parent = NODES[parent]
        obj.location = Vector(position) - NODES[parent].matrix_world.translation
    else:
        obj.location = position
    obj['steelRigNode'] = name
    NODES[name] = obj
    bpy.context.view_layer.update()
    return obj


def marker(name, parent, local, normal=None):
    world = NODES[parent].matrix_world @ Vector(local)
    node(name, world, parent)
    MARKERS[name] = {'node': parent, 'position': list(local)}
    if normal is not None:
        MARKERS[name]['normal'] = list(normal)


def material(name, colour, metallic, roughness, scratch=False, emission=0):
    mat = bpy.data.materials.new('steelproof_' + name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*colour, 1)
        shader.inputs['Emission Strength'].default_value = emission
    if scratch:
        size = 256
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
        noise = .97 + .025 * np.sin(xx * 911 + yy * 337) * np.sin(yy * 701 - xx * 113)
        # Original sparse abrasion strokes. Deliberately restrained at this scale.
        scuffs = ((np.sin(xx * 121 + yy * 7) > .996) & (np.sin(yy * 33) > .84)).astype(np.float32)
        pixels = np.ones((size, size, 4), dtype=np.float32)
        for channel in range(3):
            pixels[:, :, channel] = np.clip(colour[channel] * noise + scuffs * .028, 0, 1)
        image = bpy.data.images.new('original_' + name + '_wear', width=size, height=size, alpha=False)
        image.pixels.foreach_set(pixels.ravel())
        image.filepath_raw = str(ART / 'textures' / (name + '-wear.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    MATERIALS[name] = mat
    return mat


def materials():
    material('graphite', (.072, .092, .115), .76, .43, True)
    material('dark', (.018, .025, .034), .64, .53)
    material('steel', (.25, .30, .34), .9, .34, True)
    material('edge', (.40, .47, .50), .94, .26)
    material('orange', (.37, .085, .026), .26, .62, True)
    material('ivory', (.52, .57, .59), .18, .65, True)
    material('cobalt', (.025, .10, .34), .40, .45, True)
    material('rubber', (.012, .018, .023), 0, .86)
    material('visor', (.006, .014, .021), .45, .24)
    material('amber', (.65, .20, .025), .15, .33, emission=1.1)
    material('blue', (.065, .34, .65), .15, .33, emission=1.0)


def finish_mesh(name, vertices, faces, parent, mat, bevel=.008, part=None, damage=False):
    origin = NODES[parent].matrix_world.translation
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([Vector(p) - origin for p in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = NODES[parent]
    obj.data.materials.append(MATERIALS[mat])
    obj['originalSteelProof'] = True
    if part:
        obj['part'] = part
    if damage:
        obj['steelDamage'] = True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bevel:
        mod = obj.modifiers.new('Machined chamfer', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        mod.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Flat plates and weighted chamfer normals, never spherical smooth armour.
    for poly in obj.data.polygons:
        poly.use_smooth = True
    normals = obj.modifiers.new('Weighted plate normals', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=normals.name)
    uv = obj.data.uv_layers.new(name='SurfaceUV')
    for poly in obj.data.polygons:
        normal = poly.normal
        axes = (0, 1) if abs(normal.z) >= max(abs(normal.x), abs(normal.y)) else (1, 2) if abs(normal.x) > abs(normal.y) else (0, 2)
        for loop_index in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (co[axes[0]] * 2, co[axes[1]] * 2)
    return obj


def box(name, centre, size, parent, mat, bevel=.009, part=None):
    x, y, z = centre
    w, h, d = [v * .5 for v in size]
    vs = [(x+a*w, y+b*h, z+c*d) for a, b, c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    fs = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    return finish_mesh(name, vs, fs, parent, mat, bevel, part)


def profile(name, centre, outline, depth, parent, mat, bevel=.009, part=None):
    x, y, z = centre
    count = len(outline)
    vs = [(x+a, y+b, z+c*depth*.5) for c in [-1,1] for a,b in outline]
    fs = [tuple(range(count-1,-1,-1)), tuple(range(count,count*2))]
    fs += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    return finish_mesh(name, vs, fs, parent, mat, bevel, part)


def taper(name, centre, width, height, depth, parent, mat, bevel=.012, lower=.75, part=None):
    w, h = width*.5, height*.5
    shape = [(-w*lower,-h),(w*lower,-h),(w,-h*.5),(w,h*.66),(w*.76,h),(-w*.76,h),(-w,h*.66),(-w,-h*.5)]
    return profile(name, centre, shape, depth, parent, mat, bevel, part)


def cylinder(name, a, b, radius, parent, mat, steps=16):
    a, b = Vector(a), Vector(b)
    axis = (b-a).normalized()
    reference = Vector((0,1,0)) if abs(axis.y) < .9 else Vector((1,0,0))
    u, v = axis.cross(reference).normalized(), axis.cross(axis.cross(reference).normalized()).normalized()
    vertices = [p + radius*(math.cos(i*math.tau/steps)*u+math.sin(i*math.tau/steps)*v) for p in (a,b) for i in range(steps)]
    faces = [tuple(range(steps-1,-1,-1)),tuple(range(steps,steps*2))]
    faces += [(i,(i+1)%steps,(i+1)%steps+steps,i+steps) for i in range(steps)]
    return finish_mesh(name, vertices, faces, parent, mat, .003)


def patch(name, centre, width, height, parent, mat, part):
    x,y,z = centre
    nx,ny = max(8,round(width/.01)),max(8,round(height/.01))
    vertices=[]
    for row in range(ny+1):
        v=row/ny
        cut=.12*abs(v-.5)*2
        for col in range(nx+1):
            u=col/nx
            vertices.append((x+(u-.5)*width*(1-cut),y+(v-.5)*height,z+.008*math.sin(math.pi*u)*math.sin(math.pi*v)))
    faces=[]
    for row in range(ny):
        for col in range(nx):
            a=row*(nx+1)+col
            faces.append((a,a+1,a+nx+2,a+nx+1))
    return finish_mesh(name,vertices,faces,parent,mat,0,part,True)


def hand(suffix, heavy):
    parent='hand'+suffix
    p=NODES[parent].matrix_world.translation
    scale=1.0 if heavy else .9
    box(parent+'_palm',p+Vector((0,0,-.048)),(.15*scale,.15,.075),parent,'graphite',.012)
    for index, y in enumerate([-.05,-.017,.017,.05]):
        box(parent+'_knuckle_'+str(index),p+Vector((.057*scale,y,-.003)),(.043,.028,.055),parent,'steel',.006)
        box(parent+'_finger_'+str(index),p+Vector((.023*scale,y,.040)),(.068,.026,.037),parent,'graphite',.006)
    box(parent+'_thumb',p+Vector((-.062*scale,.021,.012)),(.035,.077,.069),parent,'steel',.006)


def skeleton(heavy):
    pelvis,chest,head,shoulder,hip,knee,ankle = (1.05,1.57,1.96,1.83,1.02,.55,.17) if heavy else (.98,1.44,1.77,1.67,.95,.50,.145)
    sx,hx=.63 if heavy else .43,.24 if heavy else .20
    upper,lower=.42 if heavy else .36,.36 if heavy else .33
    node('root',(0,0,0));node('pelvis',(0,pelvis,0),'root');node('chest',(0,chest,0),'pelvis');node('head',(0,head,.015),'chest')
    for suffix,sign in [('L',-1),('R',1)]:
        node('shoulder'+suffix,(sign*sx,shoulder,0),'chest')
        node('elbow'+suffix,(sign*(sx+.035),shoulder-upper,0),'shoulder'+suffix)
        node('wrist'+suffix,(sign*(sx+.05),shoulder-upper-lower,0),'elbow'+suffix)
        node('hand'+suffix,(sign*(sx+.05),shoulder-upper-lower-.06,.015),'wrist'+suffix)
        node('hip'+suffix,(sign*hx,hip,0),'pelvis')
        node('knee'+suffix,(sign*hx,knee,.035),'hip'+suffix)
        node('ankle'+suffix,(sign*hx,ankle,0),'knee'+suffix)
        marker('sole'+suffix,'ankle'+suffix,(0,-ankle,.10))
        hand(suffix,heavy)


def body(heavy):
    if not heavy:
        return vesper_body()
    warm='orange' if heavy else 'ivory'
    accent='orange' if heavy else 'cobalt'
    cp=NODES['chest'].matrix_world.translation
    pp=NODES['pelvis'].matrix_world.translation
    taper('rib_cage',cp,(1.02 if heavy else .72),.66 if heavy else .58,.44 if heavy else .35,'chest','dark',.015,.62)
    taper('chest_outer',cp+Vector((0,.015,.035)),1.02 if heavy else .75,.63 if heavy else .54,.43 if heavy else .36,'chest','graphite',.025,.66,'chest')
    patch('deformable_chest',cp+Vector((0,.02,.271 if heavy else .226)),.70 if heavy else .49,.30 if heavy else .28,'chest',warm,'chest')
    marker('chestImpact','chest',(0,.02,.279 if heavy else .234),(0,0,1))
    for sign in [-1,1]:
        taper('pectoral_frame_'+str(sign),cp+Vector((sign*(.405 if heavy else .295),.12,.18)),.20 if heavy else .13,.34,.20,'chest','graphite',.017,.65)
        box('upper_chest_trim_'+str(sign),cp+Vector((sign*.24,.244,.255 if heavy else .19)),(.32 if heavy else .22,.048,.06),'chest','steel',.006)
    for y in [-.22,-.15]:
        box('chest_recess_'+str(y),cp+Vector((0,y,.258 if heavy else .221)),(.31,.026,.019),'chest','dark',.003)
    taper('pelvic_housing',pp+Vector((0,-.015,0)),.64 if heavy else .47,.27,.34 if heavy else .27,'pelvis','graphite',.018,.69)
    taper('belt_central_plate',pp+Vector((0,.048,.20 if heavy else .157)),.36 if heavy else .27,.135,.045,'pelvis',accent,.006,.84)
    for index in range(3):
        box('abdominal_lamella_'+str(index),cp+Vector((0,-.29-index*.065,.17)),(.49-index*.035,.045,.055),'chest','steel' if index==1 else 'graphite',.004)
    hp=NODES['head'].matrix_world.translation
    cylinder('neck_rotor',(0,hp.y-.055,0),(0,hp.y+.04,0),.085,'head','dark')
    outline=[(-.115,0),(.115,0),(.20,.085),(.215,.265),(.15,.34),(-.15,.34),(-.215,.265),(-.20,.085)] if heavy else [(-.09,0),(.09,0),(.165,.08),(.185,.26),(.12,.33),(-.12,.33),(-.185,.26),(-.165,.08)]
    profile('helmet_shell',hp+Vector((0,0,.012)),outline,.33 if heavy else .28,'head','graphite' if heavy else 'ivory',.012)
    front=.202 if heavy else .177
    taper('visor_recess',hp+Vector((0,.204,front)),.335 if heavy else .285,.083,.033,'head','dark',.008,.82)
    for sign in [-1,1]:
        shape=[(-.068,-.011),(.055,-.011),(.068,.011),(-.055,.011)]
        profile('visor_segment_'+str(sign),hp+Vector((sign*.074,.205,front+.02)),shape,.009,'head','amber' if heavy else 'blue',.002)
    taper('brow_armour',hp+Vector((0,.273,front-.007)),.39 if heavy else .32,.061,.10,'head','graphite',.006,.90)
    taper('chin_plate',hp+Vector((0,.067,front-.02)),.23 if heavy else .20,.09,.055,'head',accent,.006,.7)
    for index in [-1,0,1]:
        box('helmet_vent_'+str(index),hp+Vector((index*.054,.111,front+.008)),(.025,.035,.012),'head','dark',.002)
    for suffix,sign in [('L',-1),('R',1)]:
        sp=NODES['shoulder'+suffix].matrix_world.translation
        ep=NODES['elbow'+suffix].matrix_world.translation
        wp=NODES['wrist'+suffix].matrix_world.translation
        shoulder_width=.43 if heavy else .31
        taper('pauldron_'+suffix,sp+Vector((sign*.025,-.025,0)),shoulder_width,.37 if heavy else .29,.45 if heavy else .32,'shoulder'+suffix,'graphite' if heavy else 'ivory',.027,.82,'shoulder'+suffix)
        taper('pauldron_cap_'+suffix,sp+Vector((sign*.025,.084,-.015)),shoulder_width*.91,.12,.41 if heavy else .29,'shoulder'+suffix,accent,.010,.90)
        if suffix=='R':
            patch('deformable_shoulderR',sp+Vector((.025,-.027,.244 if heavy else .179)),.32 if heavy else .22,.205 if heavy else .17,'shoulderR',warm,'shoulderR')
            marker('shoulderImpactR','shoulderR',(.025,-.027,.252 if heavy else .187),(0,0,1))
        centre=(sp+ep)*.5
        taper('upper_arm_shell_'+suffix,centre+Vector((0,-.025,0)),.265 if heavy else .21,.31 if heavy else .27,.245 if heavy else .21,'shoulder'+suffix,'graphite',.012,.73)
        cylinder('elbow_axle_'+suffix,ep+Vector((-.135,0,0)),ep+Vector((.135,0,0)),.112 if heavy else .089,'elbow'+suffix,'steel')
        cylinder('elbow_endcap_'+suffix,ep+Vector((sign*.131,0,0)),ep+Vector((sign*.15,0,0)),.078 if heavy else .062,'elbow'+suffix,'dark')
        centre=(ep+wp)*.5
        taper('forearm_armour_'+suffix,centre+Vector((0,-.006,.024)),.345 if heavy else .255,.32 if heavy else .29,.34 if heavy else .265,'elbow'+suffix,'graphite' if heavy else 'ivory',.015,.77)
        box('forearm_rail_'+suffix,centre+Vector((sign*.13,0,.105)),(.045,.23,.055),'elbow'+suffix,'steel',.006)
        for zz in [-.095,.09]:
            cylinder('forearm_piston_'+suffix+str(zz),ep+Vector((-sign*.09,-.05,zz)),wp+Vector((-sign*.08,.028,zz)),.025 if heavy else .018,'elbow'+suffix,'steel')
        cylinder('wrist_cuff_'+suffix,wp+Vector((0,.035,0)),wp+Vector((0,-.045,0)),.098 if heavy else .077,'wrist'+suffix,'dark')
        if heavy and suffix=='L':
            taper('braced_parry_plate',ep+Vector((0,-.18,.209)),.305,.31,.038,'elbowL','steel',.010,.86)
            marker('parryL','elbowL',(0,-.18,.231),(0,0,1))
        hip=NODES['hip'+suffix].matrix_world.translation
        knee=NODES['knee'+suffix].matrix_world.translation
        ankle=NODES['ankle'+suffix].matrix_world.translation
        taper('thigh_frame_'+suffix,(hip+knee)*.5,.34 if heavy else .255,.365 if heavy else .345,.33 if heavy else .27,'hip'+suffix,'graphite',.018,.78)
        taper('thigh_front_'+suffix,(hip+knee)*.5+Vector((0,.025,.185 if heavy else .148)),.255 if heavy else .19,.285,.044,'hip'+suffix,accent,.007,.76)
        cylinder('knee_axle_'+suffix,knee+Vector((-.125,0,0)),knee+Vector((.125,0,0)),.105 if heavy else .085,'knee'+suffix,'steel')
        taper('knee_guard_'+suffix,knee+Vector((0,.023,.14)),.29 if heavy else .245,.20,.15,'knee'+suffix,'graphite' if heavy else 'ivory',.016,.76)
        taper('shin_shell_'+suffix,(knee+ankle)*.5+Vector((0,-.006,.012)),.30 if heavy else .22,.32 if heavy else .295,.31 if heavy else .25,'knee'+suffix,'graphite',.017,.65)
        box('shin_spine_'+suffix,(knee+ankle)*.5+Vector((0,0,.175 if heavy else .145)),(.115 if heavy else .075,.22,.04),'knee'+suffix,accent,.005)
        foot_w,foot_h,foot_d=(.42,.30,.61) if heavy else (.31,.26,.53)
        foot=Vector((ankle.x,foot_h*.5,.115))
        taper('boot_'+suffix,foot,foot_w,foot_h,foot_d,'ankle'+suffix,'graphite' if heavy else 'ivory',.013,.92)
        box('boot_sole_'+suffix,(ankle.x,.026,.115),(foot_w+.015,.052,foot_d+.012),'ankle'+suffix,'rubber',.006)
        taper('toe_cap_'+suffix,(ankle.x,.11,.365 if heavy else .33),foot_w*.95,.15,.13,'ankle'+suffix,'steel',.009,.95)


def loft(name, centre, rings, parent, mat, bevel=.007, part=None):
    """Eight-sided plate loft; rings independently sculpt width/depth/sweep."""
    centre=Vector(centre)
    vertices=[]
    for y,w,front,back in rings:
        c=min(.035,w*.24)
        for x,z in [(-w+c,back),(w-c,back),(w,back+c),(w,front-c),(w-c,front),(-w+c,front),(-w,front-c),(-w,back+c)]:
            vertices.append(centre+Vector((x,y,z)))
    faces=[tuple(range(7,-1,-1)),tuple(range((len(rings)-1)*8,len(rings)*8))]
    for ring in range(len(rings)-1):
        for j in range(8):
            a=ring*8+j;b=ring*8+(j+1)%8
            faces.append((a,b,b+8,a+8))
    return finish_mesh(name,vertices,faces,parent,mat,bevel,part)


def vesper_body():
    """Athletic swept-shell fighter, independent silhouette from Bastion."""
    cp=NODES['chest'].matrix_world.translation
    pp=NODES['pelvis'].matrix_world.translation
    hp=NODES['head'].matrix_world.translation
    loft('vesper_tapered_rib_cage',cp,[(-.265,.135,.12,-.12),(-.10,.215,.17,-.15),(.16,.345,.19,-.165),(.23,.29,.11,-.13)],'chest','graphite',.014,'chest')
    # Split diagonal clavicle plates converge toward a narrow central sternum.
    for sign in [-1,1]:
        shape=[(sign*.06,-.17),(sign*.20,-.06),(sign*.335,.17),(sign*.26,.215),(sign*.055,.125)]
        if sign<0: shape.reverse()
        profile('vesper_swept_pectoral_'+str(sign),cp+Vector((0,0,.185)),shape,.058,'chest','ivory',.010,'chest')
        profile('vesper_clavicle_channel_'+str(sign),cp+Vector((0,0,.218)),[(x,y) for x,y in ([(.105,.12),(.28,.19),(.295,.168),(.12,.088)] if sign>0 else [(-.12,.088),(-.295,.168),(-.28,.19),(-.105,.12)])],.009,'chest','cobalt',.003)
    patch('deformable_chest',cp+Vector((0,.02,.226)),.285,.225,'chest','ivory','chest')
    marker('chestImpact','chest',(0,.02,.234),(0,0,1))
    loft('vesper_segmented_waist_core',pp+Vector((0,.13,0)),[(-.10,.115,.115,-.10),(.08,.11,.11,-.095),(.16,.14,.12,-.105)],'pelvis','dark',.005)
    for i in range(3):
        profile('vesper_abdominal_segment_'+str(i),pp+Vector((0,.10+i*.065,.135)),[(-.12,-.016),(.105,-.023),(.125,.018),(-.10,.028)],.029,'pelvis','steel' if i==1 else 'graphite',.004)
    loft('vesper_narrow_pelvis',pp,[(-.12,.15,.11,-.115),(-.03,.20,.13,-.14),(.055,.175,.125,-.13)],'pelvis','graphite',.009)
    profile('vesper_belt_tip',pp+Vector((0,-.005,.14)),[(-.09,.035),(.09,.035),(.055,-.055),(-.035,-.075)],.028,'pelvis','cobalt',.005)
    cylinder('vesper_neck_actuator',(0,hp.y-.052,-.018),(0,hp.y+.05,-.018),.060,'head','steel')
    loft('vesper_swept_helmet',hp,[(.015,.058,.08,-.055),(.09,.128,.13,-.11),(.245,.145,.12,-.16),(.33,.095,.035,-.19)],'head','ivory',.008)
    # Recessed continuous visor wraps around side cheeks; no chin block/mouth.
    verts=[]
    for y in [.171,.238]:
        for x,z in [(-.144,.01),(-.135,.098),(-.10,.144),(.10,.144),(.135,.098),(.144,.01)]:
            verts.append(hp+Vector((x,y-(.014 if abs(x)>.12 else 0),z)))
    faces=[(i,i+1,i+7,i+6) for i in range(5)]
    finish_mesh('vesper_wrap_visor',verts,faces,'head','visor',0)
    verts=[]
    for y in [.195,.208]:
        for x,z in [(-.134,.048),(-.118,.122),(-.08,.148),(.08,.148),(.118,.122),(.134,.048)]:
            verts.append(hp+Vector((x,y-(.013 if abs(x)>.10 else 0),z+.002)))
    finish_mesh('vesper_wrap_optic',verts,faces,'head','blue',0)
    for sign in [-1,1]:
        points=[(.072,.07),(.122,.111),(.13,.151),(.081,.142),(.040,.108)]
        if sign<0: points=[(-x,y) for x,y in reversed(points)]
        profile('vesper_cheek_undercut_'+str(sign),hp+Vector((0,0,.130)),points,.018,'head','dark',.003)
    # Swept crown spine occupies the back of the small helmet, not a tall crest.
    loft('vesper_crown_spine',hp,[(.25,.032,.015,-.17),(.326,.025,-.003,-.185)],'head','cobalt',.003)
    for suffix,sign in [('L',-1),('R',1)]:
        sp=NODES['shoulder'+suffix].matrix_world.translation
        ep=NODES['elbow'+suffix].matrix_world.translation
        wp=NODES['wrist'+suffix].matrix_world.translation
        if suffix=='R':
            shape=[(-.07,-.13),(.085,-.095),(.16,.038),(.125,.17),(-.065,.095)]
            profile('vesper_swept_blade_pauldron',sp+Vector((0,0,.005)),shape,.30,'shoulderR','graphite',.011,'shoulderR')
            profile('vesper_blade_pauldron_lip',sp+Vector((0,0,.12)),[(-.062,.079),(.121,.156),(.156,.065),(.09,.005),(-.056,.020)],.055,'shoulderR','ivory',.005,'shoulderR')
            patch('deformable_shoulderR',sp+Vector((.025,-.027,.179)),.19,.14,'shoulderR','ivory','shoulderR')
            marker('shoulderImpactR','shoulderR',(.025,-.027,.187),(0,0,1))
        else:
            cylinder('vesper_exposed_shoulder_axle',sp+Vector((-.11,0,0)),sp+Vector((.075,0,0)),.09,'shoulderL','steel')
            cylinder('vesper_shoulder_dark_hub',sp+Vector((-.125,0,0)),sp+Vector((-.112,0,0)),.069,'shoulderL','dark')
            profile('vesper_gun_harness',sp+Vector((0,0,-.075)),[(-.09,-.14),(.055,-.09),(.085,.08),(-.065,.115),(-.13,.015)],.10,'shoulderL','graphite',.006)
            cylinder('vesper_shoulder_cobalt_line',sp+Vector((.045,.065,.07)),sp+Vector((-.073,-.085,.088)),.019,'shoulderL','cobalt',10)
        # Angular arm spars and small outer shells leave flexion and grip room.
        loft('vesper_upper_arm_spar_'+suffix,sp,[(-.30,.060,.067,-.080),(-.07,.092,.075,-.083)],'shoulder'+suffix,'graphite',.006)
        profile('vesper_tricep_plate_'+suffix,sp+Vector((sign*.012,-.18,-.055)),[(-.055,-.11),(.061,-.08),(.074,.095),(-.055,.105)],.085,'shoulder'+suffix,'ivory',.007)
        cylinder('vesper_elbow_axle_'+suffix,ep+Vector((-.087,0,0)),ep+Vector((.087,0,0)),.074,'elbow'+suffix,'steel')
        cylinder('vesper_elbow_cap_'+suffix,ep+Vector((sign*.088,0,0)),ep+Vector((sign*.098,0,0)),.052,'elbow'+suffix,'dark')
        loft('vesper_tapered_forearm_'+suffix,ep,[(-.275,.06,.072,-.081),(-.145,.080,.080,-.088),(-.04,.101,.085,-.095)],'elbow'+suffix,'graphite',.008)
        profile('vesper_forearm_outer_plate_'+suffix,ep+Vector((sign*.019,-.158,-.062)),[(-.062,-.107),(.047,-.094),(.077,.085),(-.071,.11)],.105,'elbow'+suffix,'ivory',.006)
        cylinder('vesper_forearm_piston_'+suffix,ep+Vector((-sign*.062,-.06,.080)),wp+Vector((-sign*.041,.047,.060)),.017,'elbow'+suffix,'steel',12)
        cylinder('vesper_wrist_collar_'+suffix,wp+Vector((0,.025,0)),wp+Vector((0,-.028,0)),.058,'wrist'+suffix,'dark',12)
        hip=NODES['hip'+suffix].matrix_world.translation
        knee=NODES['knee'+suffix].matrix_world.translation
        ankle=NODES['ankle'+suffix].matrix_world.translation
        loft('vesper_athletic_thigh_'+suffix,hip,[(-.375,.064,.075,-.077),(-.10,.11,.11,-.12),(-.04,.09,.080,-.11)],'hip'+suffix,'graphite',.009)
        profile('vesper_thigh_swept_plate_'+suffix,hip+Vector((0,-.205,.10)),[(-.079,-.095),(.033,-.135),(.098,.084),(.077,.145),(-.08,.13)],.034,'hip'+suffix,'ivory',.005)
        cylinder('vesper_knee_axle_'+suffix,knee+Vector((-.081,0,0)),knee+Vector((.081,0,0)),.070,'knee'+suffix,'steel')
        profile('vesper_pointed_knee_'+suffix,knee+Vector((0,0,.117)),[(-.085,.062),(.073,.067),(.085,-.028),(.009,-.10),(-.074,-.028)],.075,'knee'+suffix,'cobalt',.006)
        # Long shin blade and exposed ankle rods replace the squat boot block.
        loft('vesper_long_shin_'+suffix,knee,[( -.285,.047,.070,-.055),(-.16,.061,.087,-.060),(-.04,.072,.092,-.065)],'knee'+suffix,'graphite',.006)
        profile('vesper_shin_taper_plate_'+suffix,knee+Vector((0,-.164,.094)),[(-.049,-.129),(.029,-.137),(.065,.105),(.055,.143),(-.064,.12)],.036,'knee'+suffix,'ivory',.004)
        for xx in [-.049,.049]:
            cylinder('vesper_ankle_strut_'+suffix+str(xx),knee+Vector((xx,-.235,-.009)),ankle+Vector((xx,.015,-.009)),.014,'knee'+suffix,'steel',10)
        cylinder('vesper_ankle_pin_'+suffix,ankle+Vector((-.076,0,0)),ankle+Vector((.076,0,0)),.056,'ankle'+suffix,'steel')
        loft('vesper_low_boot_'+suffix,(ankle.x,0,.03),[(.025,.123,.29,-.18),(.08,.13,.285,-.16),(.145,.092,.11,-.105)],'ankle'+suffix,'graphite',.008)
        box('vesper_ground_sole_'+suffix,(ankle.x,.018,.088),(.268,.036,.454),'ankle'+suffix,'rubber',.004)
        profile('vesper_toe_armour_'+suffix,(ankle.x,.080,.286),[(-.107,-.025),(.107,-.025),(.083,.04),(-.075,.032)],.037,'ankle'+suffix,'ivory',.004)


def weapons(heavy):
    handR=NODES['handR'].matrix_world.translation
    node('weaponR',handR,'handR')
    if heavy:
        cylinder('hammer_haft',handR+Vector((0,-.12,0)),handR+Vector((0,.44,0)),.026,'weaponR','steel')
        for index in range(5):
            cylinder('hammer_grip_band_'+str(index),handR+Vector((0,-.075+index*.027,0)),handR+Vector((0,-.058+index*.027,0)),.032,'weaponR','dark')
        box('hammer_central_mass',handR+Vector((0,.43,.025)),(.49,.235,.285),'weaponR','graphite',.018)
        for sign in [-1,1]:
            box('hammer_end_'+str(sign),handR+Vector((sign*.238,.43,.025)),(.055,.22,.274),'weaponR','steel',.009)
        box('hammer_side_housing',handR+Vector((0,.43,.178)),(.46,.19,.026),'weaponR','graphite',.007)
        box('hammer_striking_boss',handR+Vector((.2635,.43,.025)),(.007,.166,.218),'weaponR','edge',.002)
        box('hammer_back_plate',handR+Vector((0,.43,-.133)),(.39,.13,.029),'weaponR','orange',.005)
        marker('hammerFace','weaponR',(.267,.43,.025),(1,0,0))
        marker('gripR','weaponR',(0,0,0))
    else:
        cylinder('blade_grip',handR+Vector((0,-.115,0)),handR+Vector((0,.19,0)),.026,'weaponR','dark')
        box('blade_guard',handR+Vector((0,.17,.002)),(.25,.038,.075),'weaponR','steel',.006)
        outline=[(-.045,.205),(.052,.205),(.085,.72),(.035,1.02),(-.028,1.12),(-.065,.98)]
        profile('blade_steel',handR,outline,.030,'weaponR','edge',.004)
        profile('blade_fuller',handR+Vector((0,0,.018)),[(-.018,.25),(.012,.25),(.020,.83),(-.021,1.015),(-.030,.92)],.004,'weaponR','graphite',.001)
        marker('bladeTip','weaponR',(-.028,1.12,0),(0,1,0))
        marker('bladeContact','weaponR',(.084,.715,0),(1,0,0))
        marker('bladeFlat','weaponR',(.010,.70,.015),(0,0,1))
        marker('gripR','weaponR',(0,0,0))
        handL=NODES['handL'].matrix_world.translation
        node('weaponL',handL,'handL')
        taper('pistol_grip',handL+Vector((0,-.012,-.01)),.082,.20,.096,'weaponL','dark',.006,.8)
        box('pistol_receiver',handL+Vector((0,.143,.08)),(.089,.108,.30),'weaponL','graphite',.008)
        box('pistol_slide',handL+Vector((0,.196,.075)),(.096,.041,.29),'weaponL','steel',.004)
        cylinder('pistol_barrel',handL+Vector((0,.154,.19)),handL+Vector((0,.154,.315)),.025,'weaponL','dark')
        cylinder('pistol_muzzle_ring',handL+Vector((0,.154,.291)),handL+Vector((0,.154,.312)),.031,'weaponL','steel')
        box('pistol_muzzle_bore',handL+Vector((0,.154,.315)),(.026,.026,.001),'weaponL','dark',0)
        box('pistol_trigger_guard',handL+Vector((0,.028,.075)),(.019,.11,.018),'weaponL','steel',.003)
        box('pistol_trigger_base',handL+Vector((0,-.02,.036)),(.019,.018,.09),'weaponL','steel',.003)
        box('pistol_blue_id',handL+Vector((-.047,.15,.08)),(.006,.034,.12),'weaponL','cobalt',.002)
        marker('muzzleL','weaponL',(0,.154,.315),(0,0,1))
        marker('gripL','weaponL',(0,0,0))


def export_metadata(hero):
    bpy.context.view_layer.update()
    result={'schema':'steel-proof-rig-1','name':hero.title(),'units':'metres','forward':'+Z','up':'+Y','nodes':{},'markers':MARKERS,'meshes':{}}
    for name,obj in NODES.items():
        local=obj.matrix_local
        wq=obj.matrix_world.to_quaternion();lq=local.to_quaternion()
        result['nodes'][name]={'parent':obj.parent.name if obj.parent else None,'local':{'position':vec(local.translation),'quaternion':vec((lq.x,lq.y,lq.z,lq.w))},'world':{'position':vec(obj.matrix_world.translation),'quaternion':vec((wq.x,wq.y,wq.z,wq.w))}}
    minimum=Vector((1e9,1e9,1e9));maximum=Vector((-1e9,-1e9,-1e9));triangles=0
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        result['meshes'][obj.name]={'part':obj.get('part'),'steelDamage':bool(obj.get('steelDamage',False)),'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles)}
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co
            for axis in range(3):minimum[axis]=min(minimum[axis],p[axis]);maximum[axis]=max(maximum[axis],p[axis])
    result['bounds']={'min':vec(minimum),'max':vec(maximum)}
    result['triangles']=triangles
    (ASSETS/(hero+'.rig.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
    return result


def point_camera(obj,target):
    backward=(obj.location-Vector(target)).normalized()
    right=Vector((0,1,0)).cross(backward).normalized()
    up=backward.cross(right).normalized()
    obj.rotation_euler=Matrix((right,up,backward)).transposed().to_euler()


def review(hero):
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.world.color=(.12,.12,.12)
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.15,.18,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    scene.view_settings.view_transform='AgX'
    for name,position,energy,size,colour in [('key',(-3,5,5),1300,4.0,(1,.91,.80)),('fill',(3,3,3),900,3.5,(.72,.84,1)),('rim',(2,4,-4),1800,3.0,(.65,.77,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=colour
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=position;point_camera(obj,(0,1.2,0))
    floor_mat=bpy.data.materials.new('review_floor');floor_mat.diffuse_color=(.065,.08,.095,1);floor_mat.use_nodes=True;floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.83
    mesh=bpy.data.meshes.new('review_floor');mesh.from_pydata([(-200,-.012,-200),(200,-.012,-200),(200,-.012,200),(-200,-.012,200)],[],[(0,3,2,1)]);mesh.update()
    floor=bpy.data.objects.new('review_floor',mesh);bpy.context.collection.objects.link(floor);floor.data.materials.append(floor_mat)
    camera_data=bpy.data.cameras.new('review_camera');camera_data.type='ORTHO';camera_data.ortho_scale=2.85
    camera=bpy.data.objects.new('review_camera',camera_data);bpy.context.collection.objects.link(camera);scene.camera=camera
    views=[('three-quarter',(4.2,2.7,6.5))] if hero=='vesper' else [('front',(0,1.6,7)),('three-quarter',(4.2,2.7,6.5))]
    for suffix,position in views:
        camera.location=position;point_camera(camera,(0,1.13,0));scene.render.filepath=str(ART/'review'/(hero+'-'+suffix+'.png'))
        bpy.ops.render.render(write_still=True)


records=[]
for hero in (['bastion','vesper'] if args.hero=='all' else [args.hero]):
    reset();materials();heavy=hero=='bastion';skeleton(heavy);body(heavy);weapons(heavy)
    bpy.context.view_layer.update()
    metadata=export_metadata(hero)
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(hero+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/(hero+'.glb')),export_format='GLB',export_yup=False,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True,export_materials='EXPORT',export_texcoords=True,export_normals=True)
    if not args.no_render:review(hero)
    records.append({'hero':hero,'glb':str(ASSETS/(hero+'.glb')),'sha256':digest(ASSETS/(hero+'.glb')),'rig':str(ASSETS/(hero+'.rig.json')),'rigSha256':digest(ASSETS/(hero+'.rig.json')),'triangles':metadata['triangles'],'bounds':metadata['bounds']})
    print('STEEL_PROOF_ASSET '+json.dumps(records[-1]),flush=True)
(ART/'provenance.json').write_text(json.dumps({'schema':'original-steel-proof-1','source':'Original local procedural geometry and locally authored surface textures. No third-party meshes or paid generation.','purpose':'Separate ten-second metal-fighter choreography study; not an asserted competitive loadout.','coordinateContract':'Y-up +Z forward, metres. All named bind-node quaternions identity. Export uses export_yup=false because source coordinates already match game.','assets':records},indent=2),encoding='utf8')
