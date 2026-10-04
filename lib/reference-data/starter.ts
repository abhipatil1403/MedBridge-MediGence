import type { RecordKind } from "@/lib/portals/config";
// Concise factual collection, 4 October 2026. No marketing copy, images,
// fabricated packages, prices, accreditation attestations or outcomes.
export const starterCollectedAt = "2026-10-04T07:53:07Z";
export const starterReviewAfter = "2027-01-02";
export const starterSources = {
  india:{name:"National Portal of India — Explore India",url:"https://www.india.gov.in/explore-india",sourceType:"government"},
  puneCity:{name:"Pune District — Government of Maharashtra",url:"https://pune.gov.in/",sourceType:"government"},
  kokilabenContact:{name:"Kokilaben Hospital — Maps and directions",url:"https://www.kokilabenhospital.com/contacts/mapsanddirection.html",sourceType:"provider_website"},
  kokilabenBone:{name:"Kokilaben Hospital — Centre for Bone & Joint",url:"https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint.html",sourceType:"provider_website"},
  kokilabenKnee:{name:"Kokilaben Hospital — Total knee replacement",url:"https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint/totalkneereplacement.html",sourceType:"provider_website"},
  wasnik:{name:"Kokilaben Hospital — Dr. Sandeep Wasnik",url:"https://www.kokilabenhospital.com/professionals/sandeepwasnik.html",sourceType:"provider_directory"},
  deenContact:{name:"Deenanath Mangeshkar Hospital — Patient and visitors",url:"https://www.dmhospital.org/patient-and-visitors",sourceType:"provider_website"},
  deenJoint:{name:"Deenanath Mangeshkar Hospital — Joint replacement",url:"https://www.dmhospital.org/specialty-details/JOINT-REPLACEMENT",sourceType:"provider_website"},
  deenOrtho:{name:"Deenanath Mangeshkar Hospital — Orthopaedics",url:"https://www.dmhospital.org/specialty-details/ORTHOPAEDICS",sourceType:"provider_website"},
  wakankar:{name:"Deenanath Mangeshkar Hospital — Dr. Hemant Wakankar",url:"https://www.dmhospital.org/doctor-details/HEMANT-WAKANKAR",sourceType:"provider_directory"},
  maxSaket:{name:"Max Healthcare — Max Super Speciality Hospital, Saket",url:"https://www.maxhealthcare.in/hospital-network/max-super-speciality-hospital-saket",sourceType:"provider_website"},
  balbir:{name:"Max Healthcare — Dr. Balbir Singh",url:"https://www.maxhealthcare.in/doctor/dr-balbir-singh",sourceType:"provider_directory"},
  manipalContact:{name:"Manipal Hospital Old Airport Road — Contact",url:"https://www.manipalhospitals.com/oldairportroad/contact-us/",sourceType:"provider_website"},
  manipalOrtho:{name:"Manipal Hospital Old Airport Road — Orthopaedics",url:"https://www.manipalhospitals.com/oldairportroad/specialities/orthopaedics/",sourceType:"provider_website"},
  manipalCardio:{name:"Manipal Hospital Old Airport Road — Cardiology",url:"https://www.manipalhospitals.com/oldairportroad/specialities/cardiology/",sourceType:"provider_website"},
  kini:{name:"Manipal Hospital Old Airport Road — Dr. Sunil G Kini",url:"https://www.manipalhospitals.com/oldairportroad/doctors/dr-sunil-g-kini-consultant-orthopedic-arthroscopic-and-joint-replacement-surgery/",sourceType:"provider_directory"},
  apolloGreams:{name:"Apollo Hospitals — Greams Road hospital",url:"https://www.apollohospitals.com/hospitals/apollo-hospitals-greams-road-chennai",sourceType:"provider_website"},
  veerabahu:{name:"Apollo Hospitals — Dr. Veerabahu Muthusamy",url:"https://www.apollohospitals.com/doctors/orthopedician/chennai/dr-veerabahu-muthusamy",sourceType:"provider_directory"},
} as const;
export type StarterSource = keyof typeof starterSources;
export type StarterRecord = {key:string;kind:RecordKind;name:string;source:StarterSource;data:Record<string,string|number|boolean|string[]>;fieldSources?:Record<string,StarterSource>;evidence:string};
export type StarterProvider = {key:string;name:string;city:string;records:StarterRecord[]};
const profile=(name:string,city:string,address:string,source:StarterSource,extra:StarterRecord["data"]={}):StarterRecord=>({key:"profile",kind:"organization",name,source,evidence:"Official branch contact/profile page identifies this hospital, its location and the contact facts entered here. Overview is a concise factual location statement.",data:{cityId:`$city:${city}`,description:`Hospital at ${address}.`,address,website:starterSources[source].url,...extra}});
const location=(name:string,city:string,address:string,source:StarterSource):StarterRecord=>({key:"location",kind:"location",name,source,evidence:"Official hospital contact/profile page identifies this exact branch address and city. No other branch association is implied.",data:{cityId:`$city:${city}`,address}});
const specialty=(name:string,slug:string,department:string,source:StarterSource):StarterRecord=>({key:`specialty-${slug}`,kind:"specialty",name,source,evidence:"Official branch-specific page explicitly lists this specialty or department. Canonical specialty identity maps that documented term; location is limited to the branch identified by the source.",data:{specialtyId:`$specialty:${slug}`,department,locationId:"$record:location"}});
const treatment=(name:string,slug:string,description:string,source:StarterSource):StarterRecord=>({key:`treatment-${slug}`,kind:"treatment",name,source,evidence:"Official branch-specific procedure or clinician page explicitly documents this procedure at the named hospital. This is a sourced offering, not an inference from a department name or a statement of patient suitability.",data:{treatmentId:`$treatment:${slug}`,description,locationId:"$record:location"}});
const doctor=(name:string,slug:string,department:string,title:string,biography:string,source:StarterSource,extra:StarterRecord["data"]={}):StarterRecord=>({key:"doctor",kind:"doctor",name,source,evidence:"Official clinician profile supplies the name, professional role, specialty, branch association and only the profile facts entered here. No registration, appointment availability, outcomes or experience figure is inferred.",data:{specialtyId:`$specialty:${slug}`,department,professionalTitle:title,biography,locationId:"$record:location",...extra}});
export const starterProviders:StarterProvider[] = [
  {key:"kokilaben-andheri",name:"Kokilaben Dhirubhai Ambani Hospital",city:"mumbai",records:[
    profile("Kokilaben Dhirubhai Ambani Hospital","mumbai","Rao Saheb Achutrao Patwardhan Marg, Four Bunglows, Andheri West, Mumbai 400053","kokilabenContact",{phone:"+91-22-4269-6969",postalCode:"400053"}),
    location("Andheri West, Mumbai","mumbai","Rao Saheb Achutrao Patwardhan Marg, Four Bunglows, Andheri West, Mumbai 400053","kokilabenContact"),
    specialty("Orthopaedics — Centre for Bone & Joint","orthopedics","Bone & Joint / Orthopaedics","kokilabenBone"),
    treatment("Total knee replacement","knee-replacement","The Centre for Bone & Joint lists total knee replacement at Kokilaben Hospital, Mumbai.","kokilabenKnee"),
    doctor("Dr. Sandeep Wasnik","orthopedics","Bone & Joint / Orthopaedics","Consultant, Joint Replacement and Orthopaedic Surgeon","The official Kokilaben profile lists Dr. Sandeep Wasnik in the Bone & Joint / Orthopaedics department.","wasnik",{credentials:"MS (Orthopaedics); SICOT; hip and knee replacement fellowships",languages:["English","Hindi","Marathi"]}),
  ]},
  {key:"deenanath-erandwane",name:"Deenanath Mangeshkar Hospital",city:"pune",records:[
    profile("Deenanath Mangeshkar Hospital","pune","Near Mhatre Bridge, Erandwane, Pune 411004","deenContact",{phone:"+91 20 4015 1000",email:"info@dmhospital.org",postalCode:"411004"}),
    location("Erandwane, Pune","pune","Near Mhatre Bridge, Erandwane, Pune 411004","deenContact"),
    specialty("Orthopaedics","orthopedics","Orthopaedics","deenOrtho"),
    treatment("Knee replacement","knee-replacement","The Joint Replacement department lists primary, revision and partial knee replacements at the Erandwane hospital.","deenJoint"),
    doctor("Dr. Hemant Wakankar","orthopedics","Joint Replacement","Honorary Consultant","The hospital lists Dr. Hemant Wakankar as an honorary consultant in its Joint Replacement department.","wakankar",{credentials:"MBBS; MS (Ortho); DNB (Ortho Surgery); FRCS (Glasgow); MCh Orth; FRCS Orth"}),
    {key:"rehab",kind:"facility",name:"Physiotherapy department",source:"deenJoint",evidence:"The Joint Replacement page explicitly lists a dedicated rehabilitation (physiotherapy) department at this location.",data:{facilityType:"rehabilitation",locationId:"$record:location",description:"The Joint Replacement page lists a dedicated physiotherapy department."}},
    {key:"emergency",kind:"facility",name:"Emergency Room",source:"deenJoint",evidence:"The Joint Replacement page directs emergencies to DMH ER 1 and explicitly states that it is open 24 hours a day.",data:{facilityType:"emergency",locationId:"$record:location",description:"The hospital's Joint Replacement page lists Emergency Room 1 as open 24 hours a day."}},
  ]},
  {key:"max-saket",name:"Max Super Speciality Hospital, Saket",city:"new-delhi",records:[
    profile("Max Super Speciality Hospital, Saket","new-delhi","1, 2, Press Enclave Marg, Saket Institutional Area, Saket, New Delhi, Delhi 110017","maxSaket",{state:"Delhi",postalCode:"110017"}),
    location("Saket, New Delhi","new-delhi","1, 2, Press Enclave Marg, Saket Institutional Area, Saket, New Delhi, Delhi 110017","maxSaket"),
    specialty("Cardiology","cardiology","Cardiac Sciences / Cardiology","maxSaket"),
    specialty("Cancer Care / Oncology","oncology","Cancer Care / Oncology","maxSaket"),
    treatment("Chemotherapy","chemotherapy","The Saket hospital profile includes chemotherapy in its listed specialties and procedures.","maxSaket"),
    doctor("Dr. Balbir Singh","cardiology","Cardiac Sciences / Cardiology","Group Chairman, Cardiac Sciences; Chief of Interventional Cardiology and Electrophysiology, Max Saket","The official profile lists Dr. Balbir Singh in Cardiology with a practice location at Max Super Speciality Hospital, Saket.","balbir",{credentials:"MD Internal Medicine; DM Cardiology; Fellowship, American College of Cardiology"}),
  ]},
  {key:"manipal-old-airport",name:"Manipal Hospital, Old Airport Road",city:"bengaluru",records:[
    profile("Manipal Hospital, Old Airport Road","bengaluru","98, HAL Old Airport Road, Kodihalli, Bengaluru, Karnataka 560017","manipalContact",{state:"Karnataka",postalCode:"560017",email:"info@manipalhospitals.com"}),
    location("Old Airport Road, Bengaluru","bengaluru","98, HAL Old Airport Road, Kodihalli, Bengaluru, Karnataka 560017","manipalContact"),
    specialty("Orthopaedics","orthopedics","Orthopaedics","manipalOrtho"),
    specialty("Cardiology","cardiology","Cardiology","manipalCardio"),
    treatment("Knee replacement","knee-replacement","The Old Airport Road profile for Dr. Sunil G Kini lists conventional and robotic knee replacement among his procedures.","kini"),
    doctor("Dr. Sunil G Kini","orthopedics","Orthopaedics and Joint Replacement","HOD & Consultant, Orthopaedic & Robotic Joint Replacement Surgery","The official profile lists Dr. Sunil G Kini in orthopaedic and joint replacement surgery at Manipal Hospital, Old Airport Road.","kini"),
  ]},
  {key:"apollo-greams",name:"Apollo Hospitals, Greams Road",city:"chennai",records:[
    profile("Apollo Hospitals, Greams Road","chennai","21, Greams Lane, Greams Road, Thousand Lights, Chennai, Tamil Nadu 600006","apolloGreams",{state:"Tamil Nadu",postalCode:"600006",phone:"08069049756",yearEstablished:1983}),
    location("Greams Road, Chennai","chennai","21, Greams Lane, Greams Road, Thousand Lights, Chennai, Tamil Nadu 600006","apolloGreams"),
    specialty("Orthopaedics","orthopedics","Orthopaedics","apolloGreams"),
    treatment("Total knee replacement","knee-replacement","The Greams Road hospital profile lists total knee replacement in its Orthopaedics procedures.","apolloGreams"),
    doctor("Dr. Veerabahu Muthusamy","orthopedics","Orthopaedics","Senior Consultant Orthopaedic Surgeon","The official profile lists Dr. Veerabahu Muthusamy at Apollo Hospitals, Greams Road. Appointment availability requires confirmation.","veerabahu",{credentials:"MBBS; MS (Ortho); DNB (Ortho); MNAMS; MRCS (Edinburgh)",languages:["English","Hindi","Tamil"]}),
  ]},
];
