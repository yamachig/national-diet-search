/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "export",
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    webpack: (config, context) => {
        config.watchOptions = {
            poll: 1000,
            aggregateTimeout: 300,
        };
        return config;
    },
};

export default nextConfig;
