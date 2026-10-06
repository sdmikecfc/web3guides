import type {Metadata} from 'next';

export const KITCHEN_SITE='https://domainkitchen.xyz';
export const KITCHEN_DESCRIPTION='Build your dream restaurant, cook up a food-truck adventure, and welcome a whole world of hungry characters. Play the open beta.';
export const KITCHEN_SHARE_IMAGE=`${KITCHEN_SITE}/api/chef/share-image?v=1`;

/** Override the parent site's social identity for every Kitchen entry point. */
export const kitchenMetadata:Metadata={
  metadataBase:new URL(KITCHEN_SITE),
  title:{default:'Domain Kitchen',template:'%s'},
  applicationName:'Domain Kitchen',
  description:KITCHEN_DESCRIPTION,
  creator:'Domain Kitchen',
  authors:[{name:'Domain Kitchen'}],
  keywords:['Domain Kitchen','cooking game','restaurant game','food truck','open beta'],
  openGraph:{type:'website',locale:'en_US',url:KITCHEN_SITE,siteName:'Domain Kitchen',title:'Domain Kitchen · Open beta',description:KITCHEN_DESCRIPTION,images:[{url:KITCHEN_SHARE_IMAGE,width:1200,height:630,type:'image/png',alt:'Domain Kitchen — your little restaurant, a whole road of possibilities. Open beta.'}]},
  twitter:{card:'summary_large_image',title:'Domain Kitchen · Open beta',description:KITCHEN_DESCRIPTION,images:[{url:KITCHEN_SHARE_IMAGE,alt:'Domain Kitchen · Open beta'}]},
  icons:{icon:[{url:`${KITCHEN_SITE}/chef/kitchen-icon.svg`,type:'image/svg+xml'}],shortcut:`${KITCHEN_SITE}/chef/kitchen-icon.svg`},
};
