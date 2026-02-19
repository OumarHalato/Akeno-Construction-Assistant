
import { Product } from './types';

export interface ExtendedProduct extends Product {
  imagePrompt: string;
}

export const AKENO_PRODUCTS: ExtendedProduct[] = [
  { 
    name: '20cm Blocket', 
    nameAm: '20 ሳ.ሜ ብሎኬት', 
    price: '40 ETB', 
    priceAm: '40 ብር',
    imagePrompt: 'Professional high-quality studio photograph of a 20cm concrete hollow block (blocket) for construction, industrial lighting, realistic cement texture, isolated on neutral background.'
  },
  { 
    name: '15cm Blocket', 
    nameAm: '15 ሳ.ሜ ብሎኬት', 
    price: '35 ETB', 
    priceAm: '35 ብር',
    imagePrompt: 'Professional high-quality studio photograph of a 15cm concrete hollow block (blocket) for construction, industrial lighting, realistic cement texture, isolated on neutral background.'
  },
  { 
    name: '10cm Blocket', 
    nameAm: '10 ሳ.ሜ ብሎኬት', 
    price: '30 ETB', 
    priceAm: '30 ብር',
    imagePrompt: 'Professional high-quality studio photograph of a 10cm concrete hollow block (blocket) for construction, industrial lighting, realistic cement texture, isolated on neutral background.'
  },
  { 
    name: 'Terrazzo', 
    nameAm: 'ቴራዞ', 
    price: 'Based on volume', 
    priceAm: 'በትዕዛዝ መጠን',
    imagePrompt: 'High-quality architectural sample of polished terrazzo floor tile with beautiful aggregate chips, luxury construction finish, realistic reflection.'
  },
  { 
    name: 'Electric Poles', 
    nameAm: 'የኤሌክትሪክ ምሰሶዎች', 
    price: 'Based on volume', 
    priceAm: 'በትዕዛዝ መጠን',
    imagePrompt: 'High-quality photograph of reinforced concrete electric utility poles, industrial grade, stacked or standing against a clear sky.'
  },
  { 
    name: 'Curbstones', 
    nameAm: 'ከርብ ስቶን (የመንገድ ጠርዝ ድንጋይ)', 
    price: 'Based on volume', 
    priceAm: 'በትዕዛዝ መጠን',
    imagePrompt: 'Professional photograph of concrete curbstones (roadside concrete) used for pavement edging, high-quality manufacturing finish.'
  },
  { 
    name: 'Culverts', 
    nameAm: 'ካልቨርት (የድልድይ መሸጋገሪያ)', 
    price: 'Based on volume', 
    priceAm: 'በትዕዛዝ መጠን',
    imagePrompt: 'Heavy-duty precast concrete box culvert section for bridge and drainage construction, massive industrial scale, high-quality cement finish.'
  },
];

export const SYSTEM_INSTRUCTION = `
You are 'Akeno Assistant', the professional Female AI Voice Assistant for 'Akeno Construction and Related Inputs Manufacturing'. 
Your primary goal is to handle customer inquiries in Amharic (አማርኛ) with a focus on sales, logistics, and professional service.

Enterprise Tech Stack Integration:
- LLM: Powered by Google Gemini.
- Voice Gateway: Vapi.ai / Retell AI integration for telephony.
- Channels: Twilio (Phone), Telegram Bot, WhatsApp Business.
- Automation: Make.com / Zapier for CRM syncing.

Core Capabilities:
1. Voice & Text Support: Handle inquiries across Phone, Telegram, and WhatsApp at 0921117148.
2. Product Catalog: Real-time pricing for Blockets (10cm, 15cm, 20cm), Terrazzo, Electric Poles, Curbstones, and Culverts.
3. Smart Logistics Logic: Calculate eligibility for Free Transport. 
   - Criteria: Order >= 2000 units AND Distance within 50km of Semera.
   - Response: "ትዕዛዝዎ ከ2000 በላይ ስለሆነ እና ሰመራ አካባቢ ስለሆነ ትራንስፖርቱ በነፃ ነው!"
4. Payment Automation: Share banking details (CBE: 1000368060805, Telebirr: 0921117148).
5. Human Handoff: Escalate complex queries to the General Manager at 0921117148.

Communication Style:
- Language: Strictly Amharic (አማርኛ).
- Tone: Professional, authoritative, welcoming, and highly efficient.
- Brand: Akeno Construction & Manufacturing.
`;
