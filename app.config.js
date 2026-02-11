import "dotenv/config";

export default ({ config }) => ({
  ...config,
  extra: {
    deepgramApiKey: process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY,
  },
});
