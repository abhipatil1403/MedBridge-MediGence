const labels:Record<string,string>={name:"Name",cityId:"City",locationId:"Exact branch",locationIds:"Documented branches",specialtyId:"Specialty",treatmentId:"Treatment",treatmentIds:"Treatments",documentId:"Credential evidence",postalCode:"Postal code"};
export function fieldLabel(field:string){return labels[field] ?? field.replace(/([A-Z])/g," $1").replace(/^./,letter=>letter.toUpperCase());}
