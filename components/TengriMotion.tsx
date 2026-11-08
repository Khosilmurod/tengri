import Script from "next/script";

export function TengriMotion() {
  return <Script id="tengri-motion" src="/tengri-motion.js" strategy="afterInteractive" />;
}
