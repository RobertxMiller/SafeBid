// Prefer generated address from sync script; falls back to env if needed
import { SAFEBID_ADDRESS as GENERATED_SAFEBID_ADDRESS } from './addresses';
export const SAFEBID_ADDRESS: string = GENERATED_SAFEBID_ADDRESS || (import.meta as any).env.VITE_SAFEBID_ADDRESS;
