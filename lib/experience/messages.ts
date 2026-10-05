import type { Locale } from './preferences';
import { catalogueMessages } from './messages-catalogue';
import { workflowMessages } from './messages-workflows';
import { documentMessages } from './messages-documents';
import { operationMessages } from './messages-operations';
import { reviewMessages } from './messages-review';
import { uxMessages } from './messages-ux';
import { finalMessages } from './messages-final';
import { fieldMessages } from './messages-fields';
import { runtimeMessages } from './messages-runtime';
import { packageMessages } from './messages-packages';
import { companionMessages } from './messages-companion';
// Reviewed interface text only. Canonical names, provider content, evidence and citations never pass through this dictionary.
export const messages: Record<string, readonly [string,string]> = {
  ...companionMessages,
  ...packageMessages,
  ...catalogueMessages,
  ...workflowMessages,
  ...documentMessages,
  ...operationMessages,
  ...reviewMessages,
  ...uxMessages,
  ...finalMessages,
  ...fieldMessages,
  ...runtimeMessages,
  'Home':['होम','मुख्यपृष्ठ'],'Discover':['खोजें','शोधा'],'Explore':['विकल्प देखें','पर्याय पाहा'],'Plan':['योजना बनाएँ','नियोजन'],'Treat':['उपचार से जुड़ें','उपचाराशी जोडा'],'Recover':['पुनर्प्राप्ति','पुनर्प्राप्ती'],
  'Compare':['तुलना','तुलना'],'MedBridge AI':['MedBridge AI','MedBridge AI'],
  'Treatments':['उपचार','उपचार'],'Hospitals':['अस्पताल','रुग्णालये'],'Doctors':['डॉक्टर','डॉक्टर'],'Packages':['पैकेज','पॅकेज'],'Countries':['देश','देश'],'Services':['सेवाएँ','सेवा'],
  'Currency':['मुद्रा','चलन'],'Language':['भाषा','भाषा'],'Account':['खाता','खाते'],'Profile':['प्रोफ़ाइल','प्रोफाइल'],'Preferences':['पसंद','प्राधान्ये'],'Saved':['सहेजे गए','जतन केलेले'],
  'My plans':['मेरी योजनाएँ','माझ्या योजना'],'Recent searches':['हाल की खोजें','अलीकडील शोध'],'Recent conversations':['हाल की बातचीत','अलीकडील संभाषणे'],'Notifications':['सूचनाएँ','सूचना'],
  'Privacy and settings':['गोपनीयता और सेटिंग्स','गोपनीयता आणि सेटिंग्ज'],'Sign in':['साइन इन','साइन इन'],'Create account':['खाता बनाएँ','खाते तयार करा'],'Sign out':['साइन आउट','साइन आउट'],
  'Email':['ईमेल','ईमेल'],'Name':['नाम','नाव'],'Phone (optional)':['फ़ोन (वैकल्पिक)','फोन (ऐच्छिक)'],'Country':['देश','देश'],'City':['शहर','शहर'],
  'Save profile':['प्रोफ़ाइल सहेजें','प्रोफाइल जतन करा'],'Save preferences':['पसंद सहेजें','प्राधान्ये जतन करा'],'Save':['सहेजें','जतन करा'],'Remove':['हटाएँ','काढा'],'Saved hospital':['अस्पताल सहेजा गया','रुग्णालय जतन केले'],
  'Save hospital':['अस्पताल सहेजें','रुग्णालय जतन करा'],'Save doctor':['डॉक्टर सहेजें','डॉक्टर जतन करा'],'Save package':['पैकेज सहेजें','पॅकेज जतन करा'],
  'Saved doctor':['डॉक्टर सहेजा गया','डॉक्टर जतन केले'],'Saved package':['पैकेज सहेजा गया','पॅकेज जतन केले'],'Saved hospitals':['सहेजे गए अस्पताल','जतन केलेली रुग्णालये'],
  'Saved doctors':['सहेजे गए डॉक्टर','जतन केलेले डॉक्टर'],'Saved packages':['सहेजे गए पैकेज','जतन केलेली पॅकेज'],
  'Loading…':['लोड हो रहा है…','लोड होत आहे…'],'Please try again.':['कृपया फिर कोशिश करें।','कृपया पुन्हा प्रयत्न करा.'],'Sign in to continue.':['जारी रखने के लिए साइन इन करें।','पुढे जाण्यासाठी साइन इन करा.'],
  'Send sign-in link':['साइन-इन लिंक भेजें','साइन-इन लिंक पाठवा'],'Check your email and open the sign-in link. You do not need a code.':['अपने ईमेल में साइन-इन लिंक खोलें। कोड की आवश्यकता नहीं है।','ईमेलमधील साइन-इन लिंक उघडा. कोडची गरज नाही.'],
  'Your email is verified when you open the link.':['लिंक खोलने पर आपका ईमेल सत्यापित होता है।','लिंक उघडल्यावर ईमेलची पडताळणी होते.'],
  'Profile saved.':['प्रोफ़ाइल सहेजी गई।','प्रोफाइल जतन केली.'],'In-app notifications':['ऐप में सूचनाएँ','ॲपमधील सूचना'],
  'No items yet.':['अभी कोई आइटम नहीं है।','अद्याप कोणतीही नोंद नाही.'],'Open':['खोलें','उघडा'],'View':['देखें','पाहा'],'Clear recent searches':['हाल की खोजें हटाएँ','अलीकडील शोध साफ करा'],
  'Import saves from this device':['इस डिवाइस के सहेजे आइटम आयात करें','या उपकरणावरील जतन केलेल्या नोंदी आयात करा'],
  'Provider listing no longer available':['प्रदाता की लिस्टिंग अब उपलब्ध नहीं है','सेवाप्रदात्याची नोंद आता उपलब्ध नाही'],
  'Converted estimate':['परिवर्तित अनुमान','रूपांतरित अंदाज'],'Original provider price':['प्रदाता की मूल कीमत','सेवाप्रदात्याची मूळ किंमत'],'Rate':['विनिमय दर','विनिमय दर'],'Stale rate':['पुराना विनिमय दर','जुना विनिमय दर'],
  'Price not provided':['कीमत उपलब्ध नहीं है','किंमत दिलेली नाही'],'Rates by ExchangeRate-API':['विनिमय दर: ExchangeRate-API','विनिमय दर: ExchangeRate-API'],
  'Confirm the provider quote and payment rate.':['प्रदाता की कीमत और भुगतान दर की पुष्टि करें।','सेवाप्रदात्याच्या दराची आणि देयक विनिमय दराची खात्री करा.'],
  'Conversion unavailable. Original price shown.':['रूपांतरण उपलब्ध नहीं है। मूल कीमत दिखाई गई है।','रूपांतर उपलब्ध नाही. मूळ किंमत दाखवली आहे.'],
  'Loading conversion. Original price shown.':['रूपांतरण लोड हो रहा है। मूल कीमत दिखाई गई है।','रूपांतर लोड होत आहे. मूळ किंमत दाखवली आहे.'],
  'Open navigation':['नेविगेशन खोलें','मार्गदर्शन उघडा'],'Close navigation':['नेविगेशन बंद करें','मार्गदर्शन बंद करा'],'Primary navigation':['मुख्य नेविगेशन','मुख्य मार्गदर्शन'],
  'Mobile navigation':['मोबाइल नेविगेशन','मोबाइल मार्गदर्शन'],'MedBridge home':['MedBridge होम','MedBridge मुख्यपृष्ठ'],'Skip to content':['मुख्य सामग्री पर जाएँ','मुख्य मजकुरावर जा'],
  'Care':['देखभाल','देखभाल'],'Travel':['यात्रा','प्रवास'],'Medical travel':['चिकित्सा यात्रा','वैद्यकीय प्रवास'],'Second opinion':['दूसरी राय','दुसरे मत'],'Consultation pathway':['परामर्श की तैयारी','सल्लामसलतीची तयारी'],
  'Help / Support':['मदद / सहायता','मदत / सहाय्य'],'Recovery':['पुनर्प्राप्ति','पुनर्प्राप्ती'],'Lifetime Recover':['लाइफ़टाइम रिकवर','लाइफटाइम रिकव्हर'],'Recovery journey':['पुनर्प्राप्ति यात्रा','पुनर्प्राप्ती प्रवास'],
  'Your treatment may end. Your care journey can continue.':['उपचार समाप्त हो सकते हैं। आपकी देखभाल यात्रा जारी रह सकती है।','उपचार संपले तरी तुमचा देखभालीचा प्रवास सुरू राहू शकतो.'],
  'Ongoing coordination, for as long as you choose.':['जब तक आप चाहें, देखभाल का समन्वय जारी रखें।','तुमच्या इच्छेनुसार दीर्घकाळ देखभालीचा समन्वय.'],
  'Organize follow-ups, provider contacts, private documents and your next steps. Your clinician guides medical care; MedBridge helps you stay organized.':['फ़ॉलो-अप, प्रदाता संपर्क, निजी दस्तावेज़ और अगले कदम व्यवस्थित करें। चिकित्सा देखभाल आपके चिकित्सक के मार्गदर्शन में होती है; MedBridge संगठन में मदद करता है।','पाठपुरावा, सेवाप्रदात्यांचे संपर्क, खाजगी दस्तऐवज आणि पुढील पावले व्यवस्थित ठेवा. वैद्यकीय देखभाल डॉक्टरांच्या मार्गदर्शनाखाली होते; MedBridge व्यवस्थापनात मदत करते.'],
  'Create recovery journey':['पुनर्प्राप्ति यात्रा बनाएँ','पुनर्प्राप्ती प्रवास तयार करा'],'Journey title':['यात्रा का शीर्षक','प्रवासाचे शीर्षक'],'Published hospital (optional)':['प्रकाशित अस्पताल (वैकल्पिक)','प्रकाशित रुग्णालय (ऐच्छिक)'],
  'No hospital selected':['अस्पताल नहीं चुना गया','रुग्णालय निवडलेले नाही'],'Current stage':['वर्तमान चरण','सध्याचा टप्पा'],'Preparation':['तैयारी','तयारी'],'After treatment':['उपचार के बाद','उपचारानंतर'],
  'Follow-up coordination':['फ़ॉलो-अप समन्वय','पाठपुरावा समन्वय'],'Rehabilitation coordination':['पुनर्वास समन्वय','पुनर्वसन समन्वय'],'Ongoing coordination':['निरंतर समन्वय','सातत्यपूर्ण समन्वय'],'Archived':['संग्रहीत','संग्रहित'],
  'Tasks':['कार्य','कामे'],'Task title':['कार्य का शीर्षक','कामाचे शीर्षक'],'Due date (optional)':['नियत तिथि (वैकल्पिक)','नियोजित तारीख (ऐच्छिक)'],'Add task':['कार्य जोड़ें','काम जोडा'],'Complete':['पूरा करें','पूर्ण करा'],'Reopen':['फिर खोलें','पुन्हा सुरू करा'],
  'Completed':['पूरा हुआ','पूर्ण झाले'],'Upcoming':['आगामी','आगामी'],'Timeline':['समयरेखा','कालरेषा'],'Add milestone':['पड़ाव जोड़ें','महत्त्वाचा टप्पा जोडा'],'Milestone title':['पड़ाव का शीर्षक','टप्प्याचे शीर्षक'],'Date':['तारीख','तारीख'],
  'Documents':['दस्तावेज़','दस्तऐवज'],'Link existing document':['मौजूदा दस्तावेज़ जोड़ें','विद्यमान दस्तऐवज जोडा'],'Choose a document':['दस्तावेज़ चुनें','दस्तऐवज निवडा'],
  'Upload securely in MedBridge AI':['MedBridge AI में सुरक्षित अपलोड करें','MedBridge AIमध्ये सुरक्षित अपलोड करा'],
  'Provider connection':['प्रदाता से संबंध','सेवाप्रदात्याशी संबंध'],'A saved connection does not mean the provider is monitoring you or that an appointment is confirmed.':['सहेजे गए संबंध का अर्थ यह नहीं है कि प्रदाता आपकी निगरानी कर रहा है या अपॉइंटमेंट की पुष्टि हो गई है।','जतन केलेल्या संबंधाचा अर्थ सेवाप्रदाता तुमचे निरीक्षण करतो किंवा भेट निश्चित आहे असा नाही.'],
  'Contact support':['सहायता से संपर्क करें','सहाय्याशी संपर्क करा'],'Request title':['अनुरोध का शीर्षक','विनंतीचे शीर्षक'],'Describe the coordination help you need':['आवश्यक समन्वय सहायता बताएँ','हवा असलेला समन्वय स्पष्ट करा'],
  'I consent to share this written request with MedBridge Support. My journey and documents are not shared.':['मैं यह लिखित अनुरोध MedBridge सहायता के साथ साझा करने की सहमति देता/देती हूँ। मेरी यात्रा और दस्तावेज़ साझा नहीं होंगे।','ही लिखित विनंती MedBridge सहाय्याशी शेअर करण्यास मी संमती देतो/देते. माझा प्रवास आणि दस्तऐवज शेअर केले जाणार नाहीत.'],
  'Create support request':['सहायता अनुरोध बनाएँ','सहाय्य विनंती तयार करा'],'Open Patient Help':['रोगी सहायता खोलें','रुग्ण मदत उघडा'],'No coordination tasks yet.':['अभी कोई समन्वय कार्य नहीं है।','अद्याप समन्वयाची कामे नाहीत.'],
  'User-created coordination task':['उपयोगकर्ता द्वारा बनाया गया समन्वय कार्य','वापरकर्त्याने तयार केलेले समन्वयाचे काम'],'No reminders or clinical milestones are generated automatically.':['रिमाइंडर या चिकित्सकीय पड़ाव अपने आप नहीं बनाए जाते।','स्मरणपत्रे किंवा वैद्यकीय टप्पे आपोआप तयार केले जात नाहीत.'],
  'Reminders are shown here and in your account. No email, SMS or appointment booking is performed.':['रिमाइंडर यहाँ और आपके खाते में दिखते हैं। ईमेल, एसएमएस या अपॉइंटमेंट बुकिंग नहीं की जाती।','स्मरणपत्रे येथे आणि खात्यात दिसतात. ईमेल, एसएमएस किंवा भेटीचे बुकिंग केले जात नाही.'],
  'Open MedBridge assistant':['MedBridge सहायक खोलें','MedBridge सहाय्यक उघडा'],'Close assistant':['सहायक बंद करें','सहाय्यक बंद करा'],'MedBridge assistant':['MedBridge सहायक','MedBridge सहाय्यक'],
  'Send':['भेजें','पाठवा'],'Message MedBridge':['MedBridge को संदेश भेजें','MedBridge ला संदेश पाठवा'],'Ask about care options or coordination':['देखभाल विकल्प या समन्वय के बारे में पूछें','देखभाल पर्याय किंवा समन्वयाबद्दल विचारा'],
  'Working on your request…':['आपके अनुरोध पर काम चल रहा है…','तुमच्या विनंतीवर काम सुरू आहे…'],'New conversation':['नई बातचीत','नवीन संभाषण'],
  'Open in MedBridge AI':['MedBridge AI में खोलें','MedBridge AIमध्ये उघडा'],'Keep this conversation in my account':['यह बातचीत मेरे खाते में रखें','हे संभाषण माझ्या खात्यात ठेवा'],
  'Temporary conversation. Sign in to keep your plan and history.':['अस्थायी बातचीत। योजना और इतिहास रखने के लिए साइन इन करें।','तात्पुरते संभाषण. योजना आणि इतिहास जतन करण्यासाठी साइन इन करा.'],
  'Public provider context':['सार्वजनिक प्रदाता संदर्भ','सार्वजनिक सेवाप्रदाता संदर्भ'],'Medical decisions require a qualified professional.':['चिकित्सा निर्णय के लिए योग्य पेशेवर आवश्यक है।','वैद्यकीय निर्णयासाठी पात्र तज्ज्ञ आवश्यक आहे.'],
  'Your coordination context':['आपका समन्वय संदर्भ','तुमचा समन्वय संदर्भ'],'Show my upcoming recovery tasks':['मेरे आगामी पुनर्प्राप्ति कार्य दिखाएँ','माझी आगामी पुनर्प्राप्तीची कामे दाखवा'],
};
export function translate(text:string,locale:Locale):string {
  return locale==='en'?text:(messages[text]??normalizedMessages.get(normalize(text)))?.[locale==='hi'?0:1]??text;
}
const normalize=(text:string)=>text.toLowerCase().replace(/^[\s·.:;]+|[\s·.:;→]+$/g,'').replace(/\s+/g,' ');
const normalizedMessages=new Map(Object.entries(messages).map(([key,value])=>[normalize(key),value]));
