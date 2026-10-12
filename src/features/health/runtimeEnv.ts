import Constants, { ExecutionEnvironment } from 'expo-constants';

// 안드로이드 Expo Go(SDK 53+)는 expo-notifications를 "불러오는 순간" 에러를 던진다. 푸시 관련
// 모듈은 Expo Go에서 아예 불러오지 않아야 해서, 그 판단을 한 곳에 둔다. 설치된 앱(production)과
// 개발 빌드는 StoreClient가 아니므로 이 값이 항상 false다 — 실제 앱 동작은 바뀌지 않는다.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
