import { invoke } from "@tauri-apps/api/core";
export type PhoneStatus = {url:string;enabled:boolean;configured:boolean};
export const phoneStatus = () => invoke<PhoneStatus>("phone_status");
export const configurePhone = (url:string,enabled:boolean) => invoke("phone_configure",{url,enabled});
export const phoneRequest = <T>(operation:string,body:unknown={}) => invoke<T>("phone_request",{operation,body});
export const downloadPhoneFile = (id:string,name:string) => invoke<boolean>("phone_download",{id,name});
