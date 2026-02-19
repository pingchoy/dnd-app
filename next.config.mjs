/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin uses Node.js built-ins (net, tls, http2, etc.) that cannot
  // be bundled for the browser. Marking it external tells Next.js to leave it
  // as a native require() so it only runs in server-side contexts.
  experimental: {
    serverComponentsExternalPackages: [
      "firebase-admin",
      "@google-cloud/firestore",
    ],
  },
};

export default nextConfig;
