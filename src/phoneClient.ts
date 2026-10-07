import { invoke } from "@tauri-apps/api/core";
export type PhoneStatus = {url:string;enabled:boolean;configured:boolean};
export const phoneStatus = () => invoke<PhoneStatus>("phone_status");
export const configurePhone = (url:string,enabled:boolean) => invoke("phone_configure",{url,enabled});
export const phoneRequest = <T>(operation:string,body:unknown={}) => invoke<T>("phone_request",{operation,body});
export const downloadPhoneFile = (id:string,name:string) => invoke<boolean>("phone_download",{id,name});
export const cachePhoneFile = (id:string,name:string) => invoke<import("./notesStore").NoteAttachment>("phone_cache_attachment",{id,name});
export const readPhoneFile = (id:string) => invoke<import("./notesStore").NoteAttachment & {base64:string}>("phone_read_attachment",{id});
export const phoneAiAttachment = (id:string) => invoke<import("./aiAttachments").AiAttachment>("phone_ai_attachment",{id});
