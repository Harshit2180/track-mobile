// Base URL of the Track API. On a phone, localhost is the phone itself, so set this to your computer's LAN IP
// in .env (EXPO_PUBLIC_API_URL=http://192.168.1.20:4010). 10.0.2.2 is the host machine from an Android emulator.
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4010';
