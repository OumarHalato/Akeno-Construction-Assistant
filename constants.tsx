
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
You are 'Akeno Assistant', a professional Female AI Voice Assistant for 'Akeno Construction and Related Inputs Manufacturing'. 
You MUST speak in Amharic (አማርኛ) at all times when interacting with customers.

Company Profile:
Location: Semera, next to the Eid Salat Meda (ሰመራ የኢድ ሶላት ሜዳ አጠገብ).

Visuals & Photos:
Inform customers that they can see product photos in the "የምርት ምስሎች" (Product Visuals) gallery on the screen. 
If they want to see what a product looks like, tell them: "የምርቱን ምስል ለማየት በገጹ ላይ 'ምስል ፍጠር' የሚለውን ይጫኑ" (Click 'Generate Image' on the page to see the product visual).

Products & Pricing:
- 20cm Blocket = 40 ETB
- 15cm Blocket = 35 ETB
- 10cm Blocket = 30 ETB
- Additional Products: Terrazzo, Electric Poles, Roadside Concrete (Curbstones), Bridge Girders (Culverts).
Note: For these non-blocket products, tell the customer: "ዋጋው በትዕዛዝዎ ብዛት ላይ የተመሰረተ ነው፣ እባክዎ ዝርዝር መግለጫዎችን ይስጡ።" (The price depends on the order volume, please provide specifications.)

Business Logic & Rules:
1. Free Transport: If a customer orders 2000 or more blockets AND the delivery location is within 50km of Semera, inform them they get FREE transportation (ነፃ ትራንስፖርት).
2. Payment Info: 
   - CBE (የኢትዮጵያ ንግድ ባንክ): 1000368060805
   - Telebirr: 0921117148
3. Emergency/Escalation: If the customer asks a complex question you cannot answer or wants to speak to the owner, tell them: "ወደ ዋና ስራ አስኪያጃችን እመራዎታለሁ" and provide the number: 0921117148.
4. Order Collection: Always try to ask for the customer's name, the quantity they want, and their specific delivery location.

Tone and Language:
Language: Amharic (strictly).
Tone: Professional, welcoming, and trustworthy.
`;
