import type { ResearchSource } from './schemas';
export interface ApprovedSource { url: string; provider: string; aliases: string[]; location: string; treatments: string[]; type: ResearchSource['sourceType']; entityType?: 'hospital' | 'clinic' | 'doctor' | 'healthcare_provider' }
// Reviewed public source identity; each factual statement still needs retrieval.
export const approvedSources: ApprovedSource[] = [
  { url: 'https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint.html', provider: 'Kokilaben Dhirubhai Ambani Hospital', aliases: ['Kokilaben', 'Kokilaben Hospital'], location: 'Mumbai', treatments: ['knee replacement', 'hip replacement', 'orthopedics'], type: 'official_provider' },
  { url: 'https://www.nanavatimaxhospital.org/our-specialities/orthopaedics-joint-replacement', provider: 'Nanavati Max Super Speciality Hospital', aliases: ['Nanavati', 'Nanavati Max'], location: 'Mumbai', treatments: ['knee replacement', 'hip replacement', 'orthopedics'], type: 'official_provider' },
  { url: 'https://www.apollohospitals.com/region/mumbai/procedures/total-knee-replacement-surgery/', provider: 'Apollo Hospitals Mumbai', aliases: ['Apollo', 'Apollo Hospitals'], location: 'Mumbai', treatments: ['knee replacement'], type: 'official_provider' },
  { url: 'https://www.nanavatimaxhospital.org/our-specialities/knee-replacement-unit', provider: 'Nanavati Max Super Speciality Hospital', aliases: ['Nanavati', 'Nanavati Max'], location: 'Mumbai', treatments: ['knee replacement'], type: 'official_provider' },
  {url:'https://www.nanavatimaxhospital.org/contact-us',provider:'Nanavati Max Super Speciality Hospital',aliases:['Nanavati','Nanavati Max'],location:'Mumbai',treatments:[],type:'official_provider'},
  {url:'https://www.kokilabenhospital.com/contacts/mapsanddirection.html',provider:'Kokilaben Dhirubhai Ambani Hospital',aliases:['Kokilaben','Kokilaben Hospital'],location:'Mumbai',treatments:[],type:'official_provider'},
  {url:'https://www.kokilabenhospital.com/contacts/phone_directory.html',provider:'Kokilaben Dhirubhai Ambani Hospital',aliases:['Kokilaben','Kokilaben Hospital'],location:'Mumbai',treatments:[],type:'official_provider'},
];
