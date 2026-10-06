import {notFound} from 'next/navigation';
import CollectibleFilmStage from '../collection-review/CollectibleFilmStage';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <main style={{background:'#f4e9dd',color:'#31594e',minHeight:'100dvh',fontFamily:'system-ui'}}><h1 style={{margin:0,padding:16,fontSize:20}}>Collectible close-ups · isolated film fixture</h1><CollectibleFilmStage/></main>;}
