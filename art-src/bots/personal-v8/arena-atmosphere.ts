import * as T from 'three';
/** Screen-space atmosphere, composited behind every fighter. The plate's floor and
 * architecture stay fixed; only bounded distant regions receive motion. */
export function arenaAtmosphere(scene:T.Scene){
 const uniforms={arenaTime:{value:0},arenaTheme:{value:0},arenaMotion:{value:0}};
 const geometry=new T.PlaneGeometry(2,2),material=new T.MeshBasicMaterial({depthTest:false,depthWrite:false,fog:false,toneMapped:false});
 const plane=new T.Mesh(geometry,material);plane.visible=false;plane.frustumCulled=false;plane.renderOrder=-10000;scene.add(plane);
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position = vec4(position.xy, 0.9999, 1.0);');
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',`
  uniform float arenaTime; uniform float arenaTheme; uniform float arenaMotion;
  float band(float x,float lo,float hi,float feather){return smoothstep(lo,lo+feather,x)*(1.0-smoothstep(hi-feather,hi,x));}
  vec2 arenaSample(vec2 uv){
   if(arenaTheme>0.5&&arenaTheme<1.5&&arenaMotion>0.5){
    vec3 cloth=texture2D(map,uv).rgb;
    float red=smoothstep(.05,.18,cloth.r-max(cloth.g,cloth.b));
    float area=(band(uv.x,.395,.435,.008)+band(uv.x,.568,.605,.008))*band(uv.y,.580,.792,.020);
    uv.x+=.0025*sin(uv.y*65.0-arenaTime*3.0)*red*area;
    uv.y+=.001*sin(uv.x*55.0-arenaTime*2.6)*red*area;
   }
   return uv;
  }
  vec3 atmosphere(vec2 uv,vec3 color){
   if(arenaMotion<.5)return color;
   float t=arenaTime;
   if(arenaTheme<.5){
    float windowMask=band(uv.x,.17,.83,.04)*band(uv.y,.56,.89,.04);
    // Distant illuminated fragments drift across the observation window.
    for(int i=0;i<9;i++){
     float f=float(i),x=.15+fract(f*.137+t*(.016+f*.0006))*.70,y=.62+fract(f*.271)*.20;
     vec2 q=(uv-vec2(x,y))*vec2(1.0,0.5625);
     float r=.0018+mod(f,3.0)*.0013;
     float rock=1.0-smoothstep(r*.55,r,length(q));
     float halo=exp(-dot(q,q)/(r*r*5.0));
     color=mix(color,vec3(.055,.10,.14),rock*.9*windowMask);
     color+=vec3(.045,.15,.23)*halo*.5*windowMask;
    }
    float scan=exp(-pow((uv.x-fract(t*.15))/.055,2.0))*band(uv.y,.535,.555,.007);
    color+=vec3(.03,.22,.32)*scan;
   }else if(arenaTheme<1.5){
    // Sparks rise from existing braziers; flags retain their authored attachments.
    for(int i=0;i<6;i++){
     float f=float(i),x=i==0?.10:i==1?.245:i==2?.326:i==3?.674:i==4?.755:.90;
     float y=(i==0||i==5)?.633:.590;
     float lift=fract(t*.45+f*.17);
     vec2 p=vec2(x+.003*sin(t*4.0+f)+.007*sin(lift*5.0+f),y+lift*.095);
     float ember=exp(-dot((uv-p)*vec2(1.0,.5625),(uv-p)*vec2(1.0,.5625))/.000005);
     color+=vec3(.9,.28,.035)*ember*(1.0-lift);
     vec2 q=(uv-vec2(x,y+.019))*vec2(1.0,.36);
     float flame=exp(-dot(q,q)/.000085)*(.55+.30*sin(t*8.0+f));
     color+=vec3(.13,.037,.004)*flame;
    }
   }else{
    // Broad, slow puffs emerge from the overhead pipe joints, above the fight.
    for(int i=0;i<6;i++){
     float f=float(i),life=fract(t*.12+f*.167),side=mod(f,2.0);
     vec2 origin=vec2(mix(.30,.72,side),.83);
     vec2 p=origin+vec2((side-.5)*life*.19,life*.12);
     vec2 q=(uv-p)*vec2(1.0,1.7);
     float r=.012+life*.035,cloud=exp(-dot(q,q)/(r*r));
     float turbulence=.75+.25*sin(uv.x*130.0+uv.y*70.0-t*2.0);
     float density=cloud*sin(life*3.14159)*.24*turbulence*band(uv.y,.80,1.02,.025);
     color=mix(color,vec3(.43,.48,.49),density);
    }
    float sweep=.46+.10*sin(t*.5),beam=exp(-pow((uv.x-sweep-(1.0-uv.y)*.16)/.05,2.0));
    color+=vec3(.015,.021,.025)*beam*band(uv.y,.66,.94,.10);
   }
   return color;
  }
  void main() {`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, arenaSample(vMapUv) )')+'\ndiffuseColor.rgb = atmosphere(vMapUv, diffuseColor.rgb);');
 };
 material.customProgramCacheKey=()=> 'mk-arena-atmosphere-1';
 return {
  setTexture(texture:T.Texture|null){if(material.map===texture)return;material.map=texture;material.needsUpdate=true;plane.visible=!!texture;scene.background=null;},
  update(id:string,time:number,on:boolean){uniforms.arenaTheme.value=id==='spaceship'?0:id==='colosseum'?1:2;uniforms.arenaTime.value=time;uniforms.arenaMotion.value=on?1:0;},
  get map(){return material.map},
  dispose(){plane.removeFromParent();geometry.dispose();material.dispose()}
 };
}
