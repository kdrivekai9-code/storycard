export interface KakaoPlace {
  place_name: string;
  address_name: string;
  road_address_name: string;
}

interface KakaoPlacesService {
  keywordSearch(
    query: string,
    callback: (data: KakaoPlace[], status: string) => void
  ): void;
}

interface KakaoMapsServicesNamespace {
  Places: new () => KakaoPlacesService;
  Status: { OK: string; ZERO_RESULT: string; ERROR: string };
}

interface KakaoMapsNamespace {
  services: KakaoMapsServicesNamespace;
  load(callback: () => void): void;
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsNamespace };
  }
}

let loadingPromise: Promise<void> | null = null;

/** 카카오 지도 SDK(services 라이브러리)를 동적으로 로드합니다. */
function loadKakaoMapsSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경에서만 사용할 수 있습니다."));
  }
  if (window.kakao?.maps?.services) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!appkey) {
    return Promise.reject(new Error("카카오 지도 API 키(NEXT_PUBLIC_KAKAO_MAP_KEY)가 설정되지 않았습니다."));
  }

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&libraries=services&autoload=false`;
    script.onload = () => window.kakao!.maps.load(() => resolve());
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}

/** 상호명/키워드로 카카오 장소를 검색합니다. */
export async function searchKakaoPlaces(query: string): Promise<KakaoPlace[]> {
  await loadKakaoMapsSdk();
  const { services } = window.kakao!.maps;

  return new Promise((resolve, reject) => {
    new services.Places().keywordSearch(query, (data, status) => {
      if (status === services.Status.OK) resolve(data);
      else if (status === services.Status.ZERO_RESULT) resolve([]);
      else reject(new Error("검색 중 오류가 발생했습니다."));
    });
  });
}
