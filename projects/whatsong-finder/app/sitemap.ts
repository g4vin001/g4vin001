import type { MetadataRoute } from 'next';
export default function sitemap():MetadataRoute.Sitemap{return ['','/how-it-works','/privacy','/terms','/support'].map(path=>({url:'https://whatsong-finder.paz-peter.chatgpt.site'+path}));}
