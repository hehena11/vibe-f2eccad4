// 기상청 공공데이터포털에서 발급받은 "일반 인증키(Decoding)"를 입력하세요.
// 입력한 키는 이 브라우저에만 저장됩니다.
const API_BASE =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const loadWeatherBtn = document.getElementById("loadWeatherBtn");
const statusText = document.getElementById("statusText");

const locationText = document.getElementById("locationText");
const dateText = document.getElementById("dateText");
const weatherIcon = document.getElementById("weatherIcon");
const temperature = document.getElementById("temperature");
const skyText = document.getElementById("skyText");
const rainText = document.getElementById("rainText");
const humidity = document.getElementById("humidity");
const wind = document.getElementById("wind");
const minTemp = document.getElementById("minTemp");
const maxTemp = document.getElementById("maxTemp");
const outfitTitle = document.getElementById("outfitTitle");
const outfitDescription = document.getElementById("outfitDescription");
const outfitItems = document.getElementById("outfitItems");
const weatherTip = document.getElementById("weatherTip");

apiKeyInput.value = localStorage.getItem("weatherApiKey") || "";

dateText.textContent = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
}).format(new Date());

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    showStatus("먼저 기상청 API 키를 입력해 주세요.", true);
    return;
  }

  localStorage.setItem("weatherApiKey", key);
  showStatus("API 키를 저장했어요. 이제 날씨를 조회해 보세요.");
});

loadWeatherBtn.addEventListener("click", loadWeather);

async function loadWeather() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus("기상청 API 일반 인증키를 먼저 입력해 주세요.", true);
    apiKeyInput.focus();
    return;
  }

  localStorage.setItem("weatherApiKey", apiKey);
  setLoading(true);
  showStatus("현재 위치와 날씨를 확인하고 있어요...");

  try {
    const position = await getCurrentPosition();
    const { latitude, longitude } = position.coords;
    const grid = convertToGrid(latitude, longitude);

    locationText.textContent = "현재 위치 날씨";
    const forecastData = await fetchForecast(apiKey, grid.nx, grid.ny);
    const weather = organizeWeatherData(forecastData);

    renderWeather(weather);
    showStatus("오늘의 옷차림 추천을 완성했어요!");
  } catch (error) {
    console.error(error);
    showStatus(error.message || "날씨 정보를 불러오지 못했어요. 다시 시도해 주세요.", true);
    locationText.textContent = "날씨 조회가 필요해요";
  } finally {
    setLoading(false);
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저에서는 위치 정보를 지원하지 않아요."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, () => {
      reject(new Error("위치 권한을 허용한 뒤 다시 눌러 주세요."));
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    });
  });
}

async function fetchForecast(apiKey, nx, ny) {
  const base = getBaseDateTime();
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: base.date,
    base_time: base.time,
    nx: String(nx),
    ny: String(ny)
  });

  const response = await fetch(`${API_BASE}?${params.toString()}`);

  if (!response.ok) {
    throw new Error("기상청 서버에서 날씨 정보를 가져오지 못했어요.");
  }

  const data = await response.json();
  const header = data?.response?.header;
  const items = data?.response?.body?.items?.item;

  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg || "API 키 또는 요청 정보를 확인해 주세요.");
  }

  if (!items || items.length === 0) {
    throw new Error("받아온 예보 정보가 없어요. 잠시 뒤 다시 시도해 주세요.");
  }

  return items;
}

function getBaseDateTime() {
  const now = new Date();
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  let selectedHour = -1;

  // 단기예보는 매 발표 시각의 약 10분 후부터 조회할 수 있습니다.
  for (let i = baseHours.length - 1; i >= 0; i--) {
    if (
      now.getHours() > baseHours[i] ||
      (now.getHours() === baseHours[i] && now.getMinutes() >= 10)
    ) {
      selectedHour = baseHours[i];
      break;
    }
  }

  if (selectedHour === -1) {
    now.setDate(now.getDate() - 1);
    selectedHour = 23;
  }

  return {
    date: formatDate(now),
    time: String(selectedHour).padStart(2, "0") + "00"
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function organizeWeatherData(items) {
  const now = new Date();
  const today = formatDate(now);
  const currentTime = String(now.getHours()).padStart(2, "0") + "00";

  const hourlyGroups = {};
  const daily = {};

  items.forEach((item) => {
    const key = `${item.fcstDate}${item.fcstTime}`;

    if (!hourlyGroups[key]) {
      hourlyGroups[key] = {
        date: item.fcstDate,
        time: item.fcstTime
      };
    }

    hourlyGroups[key][item.category] = item.fcstValue;

    if (item.fcstDate === today) {
      daily[item.category] = daily[item.category] || [];
      daily[item.category].push(Number(item.fcstValue));
    }
  });

  const forecasts = Object.values(hourlyGroups)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  let selected = forecasts.find((item) =>
    item.date === today && item.time >= currentTime && item.TMP !== undefined
  );

  if (!selected) {
    selected = forecasts.find((item) => item.TMP !== undefined);
  }

  if (!selected) {
    throw new Error("온도 예보를 찾지 못했어요.");
  }

  const minValues = daily.TMN || [];
  const maxValues = daily.TMX || [];
  const tempValues = daily.TMP || [];

  return {
    temp: Number(selected.TMP),
    sky: selected.SKY || "1",
    pty: selected.PTY || "0",
    humidity: selected.REH || "--",
    wind: selected.WSD || "--",
    min: minValues.length ? Math.min(...minValues) : Math.min(...tempValues),
    max: maxValues.length ? Math.max(...maxValues) : Math.max(...tempValues)
  };
}

function renderWeather(weather) {
  const condition = getWeatherCondition(weather.sky, weather.pty);
  const outfit = getOutfitRecommendation(weather.temp, weather.pty, weather.wind);

  temperature.textContent = `${Math.round(weather.temp)}°`;
  skyText.textContent = condition.name;
  rainText.textContent = condition.rainText;
  weatherIcon.textContent = condition.icon;
  humidity.textContent = `${weather.humidity}%`;
  wind.textContent = `${weather.wind} m/s`;
  minTemp.textContent = `${Math.round(weather.min)}°`;
  maxTemp.textContent = `${Math.round(weather.max)}°`;

  outfitTitle.textContent = outfit.title;
  outfitDescription.textContent = outfit.description;
  outfitItems.innerHTML = outfit.items.map((item) => `<span>${item}</span>`).join("");
  weatherTip.innerHTML = `<span>💡</span><p>${outfit.tip}</p>`;
}

function getWeatherCondition(sky, pty) {
  const precipitation = {
    "1": { name: "비", icon: "🌧️", rainText: "비가 내려요" },
    "2": { name: "비/눈", icon: "🌨️", rainText: "비와 눈이 섞여 내려요" },
    "3": { name: "눈", icon: "❄️", rainText: "눈이 내려요" },
    "4": { name: "소나기", icon: "🌦️", rainText: "소나기가 예상돼요" }
  };

  if (precipitation[pty]) return precipitation[pty];

  const skies = {
    "1": { name: "맑음", icon: "☀️", rainText: "맑은 날이에요" },
    "3": { name: "구름 많음", icon: "🌤️", rainText: "구름이 조금 있어요" },
    "4": { name: "흐림", icon: "☁️", rainText: "흐린 날이에요" }
  };

  return skies[sky] || skies["1"];
}

function getOutfitRecommendation(temp, pty, windSpeed) {
  let result;

  if (temp >= 28) {
    result = {
      title: "한여름처럼 가볍게 입어요!",
      description: "더운 날씨예요. 땀 흡수가 잘되고 시원한 옷차림이 좋아요.",
      items: ["👕 반팔", "🩳 반바지", "🩴 샌들"],
      tip: "햇볕이 강할 수 있어요. 모자, 선글라스, 자외선 차단제를 챙겨보세요."
    };
  } else if (temp >= 23) {
    result = {
      title: "가벼운 여름 옷차림이 좋아요",
      description: "낮에는 따뜻하거나 더울 수 있는 날씨예요.",
      items: ["👕 반팔", "👖 얇은 긴바지", "🧥 얇은 셔츠"],
      tip: "실내 냉방이 걱정된다면 얇은 가디건 하나를 챙겨도 좋아요."
    };
  } else if (temp >= 20) {
    result = {
      title: "긴팔 하나면 딱 좋아요",
      description: "선선하고 활동하기 좋은 기온이에요.",
      items: ["👔 긴팔 티셔츠", "👖 면바지", "👟 운동화"],
      tip: "아침저녁 기온 차이를 생각해 얇은 겉옷을 준비해 보세요."
    };
  } else if (temp >= 17) {
    result = {
      title: "얇은 겉옷을 챙겨주세요",
      description: "바람이 불면 조금 쌀쌀하게 느껴질 수 있어요.",
      items: ["👕 긴팔", "🧥 가디건", "👖 긴바지"],
      tip: "특히 저녁까지 밖에 있다면 가벼운 재킷이 유용해요."
    };
  } else if (temp >= 12) {
    result = {
      title: "재킷이나 니트가 필요한 날이에요",
      description: "선선함을 넘어 쌀쌀하게 느껴질 수 있어요.",
      items: ["🧶 니트", "🧥 재킷", "👖 청바지"],
      tip: "얇은 겉옷보다는 바람을 막아주는 재킷을 추천해요."
    };
  } else if (temp >= 9) {
    result = {
      title: "따뜻한 아우터를 입어요",
      description: "외출할 때 꽤 쌀쌀한 날씨예요.",
      items: ["🧥 트렌치코트", "🧶 니트", "👖 두꺼운 바지"],
      tip: "목이 추울 수 있으니 머플러나 목도리를 함께 챙겨보세요."
    };
  } else if (temp >= 5) {
    result = {
      title: "코트나 경량 패딩을 추천해요",
      description: "추위를 느끼기 쉬운 기온이에요. 따뜻하게 입으세요!",
      items: ["🧥 코트", "🪶 경량 패딩", "🧣 목도리"],
      tip: "손이 시릴 수 있으니 장갑을 챙기면 더욱 좋아요."
    };
  } else {
    result = {
      title: "오늘은 정말 따뜻하게 입어야 해요!",
      description: "매우 추운 날씨예요. 보온에 가장 신경 써주세요.",
      items: ["🧥 두꺼운 패딩", "🧣 목도리", "🧤 장갑", "🧢 방한용품"],
      tip: "체감온도는 더 낮을 수 있어요. 피부가 드러나지 않도록 따뜻하게 입어주세요."
    };
  }

  if (pty !== "0") {
    result.items.push("☂️ 우산");
    result.tip = "비 또는 눈 예보가 있어요. 미끄럼에 주의하고 우산을 꼭 챙기세요.";
  } else if (Number(windSpeed) >= 7) {
    result.tip = "바람이 강한 편이에요. 실제 기온보다 더 춥게 느껴질 수 있으니 겉옷을 챙기세요.";
  }

  return result;
}

function setLoading(isLoading) {
  loadWeatherBtn.disabled = isLoading;
  loadWeatherBtn.textContent = isLoading
    ? "날씨를 불러오는 중..."
    : "내 위치 날씨로 옷차림 추천받기";
}

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#d34a4a" : "#71809d";
}

// 위도·경도를 기상청 격자 좌표(nx, ny)로 변환하는 함수
function convertToGrid(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);

  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}