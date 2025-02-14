import { Dimensions, I18nManager, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales, getTimeZone } from "react-native-localize";

export const getTrackingSessionData = async (sessionId: string) => {
  // Get Screen Resolution
  const getScreenResolution = () => {
    const { width, height } = Dimensions.get("window");
    return `${width}x${height}`;
  };

  // Get User-Agent
  const getUserAgent = async () => {
    return Platform.OS === "android" ? await DeviceInfo.getUserAgent() : `${Platform.OS} ${DeviceInfo.getSystemVersion()}`;
  };

  // Get Device Model
  const getDeviceModel = () => {
    return DeviceInfo.getModel();
  };

  // Get OS & Version
  const getOsVersion = () => {
    return `${DeviceInfo.getSystemName()} ${DeviceInfo.getSystemVersion()}`;
  };

  // Get Language
  const getLanguage = () => {
    const locales = getLocales();
    return locales.length > 0 ? locales[0].languageTag : undefined;
  };

  // Collect All Data
  const userAgent = await getUserAgent();

  return {
    session_id: sessionId,
    user_agent: userAgent,
    device_model: getDeviceModel(),
    os_version: getOsVersion(),
    screen_resolution: getScreenResolution(),
    timezone: getTimeZone(),
    language: getLanguage(),
  };
};
