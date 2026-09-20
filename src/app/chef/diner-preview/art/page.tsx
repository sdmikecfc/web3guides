import { notFound } from 'next/navigation';
import { ModelIcon } from '../ModelIcon';

export const metadata={title:'Domain Kitchen · Art bench',robots:{index:false,follow:false}};

/** Development-only inspection of the real shared models. No save or reward commands. */
export default function DinerArtBench(){
  if(process.env.NODE_ENV!=='development')notFound();
  const card={background:'#fffaf0',border:'1px solid #decfb9',borderRadius:20,padding:18,display:'grid',placeItems:'center',gap:8} as const;
  return <main style={{minHeight:'100vh',background:'#f3e8da',padding:'32px 24px',color:'#3c6151',fontFamily:'system-ui,sans-serif'}}>
    <div style={{maxWidth:1100,margin:'0 auto'}}>
      <p style={{fontSize:11,letterSpacing:2,textTransform:'uppercase'}}>Domain Kitchen · development art bench</p>
      <h1 style={{font:'800 32px system-ui',margin:'10px 0'}}>A kitchen with a little character</h1>
      <p>Actual game models. This page does not change your restaurant.</p>
      <section aria-label="Recipe presentation milestones" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:16,margin:'24px 0'}}>
        {[0,3,10].map(level=><article key={level} style={card}><ModelIcon kind="food" recipeId="classic_burger" mastery={level} label={`Burger at level ${level}`} size={230}/><strong>{level===0?'First favourite':level===3?'Signature plate':'House masterpiece'}</strong><small>Recipe level {level}</small></article>)}
      </section>
      <section aria-label="Staff and dining furniture" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:16}}>
        {[['chef','Your chef'],['waiter','Your waiter'],['customer','A regular'],['chair','Café chair'],['table_2','Table for two']].map(([kind,name],index)=><article key={kind} style={card}><ModelIcon kind={kind} look={index} label={name} size={175}/><strong>{name}</strong></article>)}
      </section>
      <section aria-label="Mastered dishes" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:16,margin:'24px 0'}}>
        {['fries','pancakes','strawberry_waffle','coffee','strawberry_shake'].map(id=><article key={id} style={card}><ModelIcon kind="food" recipeId={id} mastery={10} label={id.replaceAll('_',' ')} size={175}/><strong>{id.replaceAll('_',' ')}</strong></article>)}
      </section>
      <a href="/chef/diner-preview" style={{color:'#3c6151'}}>Back to the restaurant</a>
    </div>
  </main>;
}
