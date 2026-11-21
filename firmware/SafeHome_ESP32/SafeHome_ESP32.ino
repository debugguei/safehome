#include <WiFi.h>
#include <HTTPClient.h>

// ===================== CONFIGURAÇÃO: preencha antes de gravar =====================
const char* WIFI_SSID = "SEU_WIFI";
const char* WIFI_PASS = "SUA_SENHA";

// Endereço BASE do servidor (sem /api/gas no fim). Ex.: "http://192.168.0.10:3000"
// Em produção: "http://IP_PUBLICO:3000" (ver AWS_PASSO_A_PASSO.md).
const char* SERVER_BASE = "http://SEU_SERVIDOR:3000";

// Identificador deste sensor. Use um por placa: "esp32-1", "cozinha", "garagem"...
const char* DEVICE_ID = "esp32-1";

// Token do dispositivo. Deixe "" para não usar. Se o servidor tiver DEVICE_TOKEN,
// coloque aqui o mesmo valor; ele vai no cabeçalho X-Device-Token.
const char* DEVICE_TOKEN = "";

// ===================== Pinos =====================
// Entradas analógicas (use ADC1: 32..39, que funcionam com o Wi-Fi ligado)
const int PIN_MQ2 = 36; // fumaça
const int PIN_MQ5 = 32; // gás natural
const int PIN_MQ6 = 35; // GLP

const int PIN_LED_VERDE    = 25; // Normal
const int PIN_LED_AMARELO  = 26; // Atenção / sem Wi-Fi / sem servidor
const int PIN_LED_VERMELHO = 27; // Crítico

const int PIN_BUZZER = 33;       // sirene local (buzzer ativo: HIGH liga)
const int PIN_BOTAO_TESTE = 4;   // botão de teste (ligar ao GND; usa pull-up interno)

// ===================== Limites (provisórios: calibrar em ar limpo) =====================
int LIMIAR_FUMACA  = 1500;
int LIMIAR_GAS_NAT = 1500;
int LIMIAR_GAS_BUT = 1500;
const float FRACAO_ATENCAO = 0.8;

const unsigned long INTERVALO_ENVIO_MS     = 3000;
const unsigned long INTERVALO_RECONEXAO_MS = 10000;
const unsigned long DURACAO_TESTE_MS       = 4000;  // duração do teste local pelo botão

bool falhaServidor = false;
unsigned long ultimoEnvio = 0;
unsigned long ultimaTentativaWifi = 0;

// Estado do botão / teste local
bool botaoAnterior = HIGH;
unsigned long testeLocalAte = 0;

void setLeds(bool verde, bool amarelo, bool vermelho) {
  digitalWrite(PIN_LED_VERDE, verde ? HIGH : LOW);
  digitalWrite(PIN_LED_AMARELO, amarelo ? HIGH : LOW);
  digitalWrite(PIN_LED_VERMELHO, vermelho ? HIGH : LOW);
}

// Sirene intermitente baseada no tempo (não trava o loop).
void atualizarBuzzer(bool ligado) {
  if (!ligado) { digitalWrite(PIN_BUZZER, LOW); return; }
  bool fase = (millis() % 700) < 400; // ~400ms ligado, ~300ms desligado
  digitalWrite(PIN_BUZZER, fase ? HIGH : LOW);
}

String urlGas() { return String(SERVER_BASE) + "/api/gas"; }
String urlSelftest() { return String(SERVER_BASE) + "/api/v1/selftest"; }

bool enviarLeitura(int fumaca, int gasNat, int gasBut) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.setTimeout(3000);
  http.begin(urlGas());
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_TOKEN) > 0) http.addHeader("X-Device-Token", DEVICE_TOKEN);

  String payload = String("{\"fumaca\":") + fumaca +
                   ",\"gas_nat\":" + gasNat +
                   ",\"gas_but\":" + gasBut +
                   ",\"device_id\":\"" + DEVICE_ID + "\"}";

  int httpCode = http.POST(payload);
  String resposta = (httpCode > 0) ? http.getString() : "";
  resposta.trim();
  http.end();

  Serial.printf("POST /api/gas -> %d | %s | %s\n", httpCode, resposta.c_str(), payload.c_str());
  resposta.toLowerCase();
  return (httpCode >= 200 && httpCode < 300) && (resposta.indexOf("lido") != -1);
}

// Avisa o servidor que um autoteste começou (faz o app acender também).
void avisarAutoteste() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(urlSelftest());
  http.addHeader("Content-Type", "application/json");
  int c = http.POST(String("{\"device_id\":\"") + DEVICE_ID + "\"}");
  Serial.printf("POST /api/v1/selftest -> %d\n", c);
  http.end();
}

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando ao Wi-Fi");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    setLeds(false, (millis() / 300) % 2, false); // pisca amarelo enquanto conecta
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi OK. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Sem Wi-Fi. O alarme local continua funcionando.");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_AMARELO, OUTPUT);
  pinMode(PIN_LED_VERMELHO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BOTAO_TESTE, INPUT_PULLUP);
  digitalWrite(PIN_BUZZER, LOW);
  setLeds(false, true, false);
  conectarWifi();
}

void loop() {
  unsigned long agora = millis();

  // ---- Botão de teste (borda de descida) ----
  bool botao = digitalRead(PIN_BOTAO_TESTE);
  if (botaoAnterior == HIGH && botao == LOW) {
    testeLocalAte = agora + DURACAO_TESTE_MS;
    Serial.println("Botão de teste: sirene + LEDs");
    avisarAutoteste();
  }
  botaoAnterior = botao;
  bool emTesteLocal = agora < testeLocalAte;

  // ---- Leitura dos sensores ----
  int fumaca = analogRead(PIN_MQ2);
  int gasNat = analogRead(PIN_MQ5);
  int gasBut = analogRead(PIN_MQ6);

  bool critico = (fumaca >= LIMIAR_FUMACA) || (gasNat >= LIMIAR_GAS_NAT) || (gasBut >= LIMIAR_GAS_BUT);
  bool atencao = (fumaca >= LIMIAR_FUMACA * FRACAO_ATENCAO) ||
                 (gasNat >= LIMIAR_GAS_NAT * FRACAO_ATENCAO) ||
                 (gasBut >= LIMIAR_GAS_BUT * FRACAO_ATENCAO);

  // ---- Rede: reconecta ou envia ----
  bool wifiConectado = (WiFi.status() == WL_CONNECTED);
  if (!wifiConectado) {
    falhaServidor = true;
    if (agora - ultimaTentativaWifi >= INTERVALO_RECONEXAO_MS) {
      ultimaTentativaWifi = agora;
      Serial.println("Sem Wi-Fi. Reconectando...");
      WiFi.reconnect();
    }
  } else if (ultimoEnvio == 0 || agora - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = agora;
    falhaServidor = !enviarLeitura(fumaca, gasNat, gasBut);
  }

  // ---- Alarme LOCAL (independe de rede/app) ----
  bool alarme = critico || emTesteLocal;
  atualizarBuzzer(alarme);
  if (alarme) {
    setLeds(false, false, true);
  } else if (atencao || falhaServidor) {
    setLeds(false, true, false);
  } else {
    setLeds(true, false, false);
  }

  delay(80);
}
