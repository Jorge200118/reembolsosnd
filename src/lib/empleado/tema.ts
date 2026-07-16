import { Fraunces, Work_Sans } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

export const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work",
  weight: ["300", "400", "500", "600"],
});
