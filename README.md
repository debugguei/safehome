# SafeHome: detecção de gás e fumaça com monitoramento remoto

Projeto da disciplina de Computação Embarcada (ESEG). Três partes:

| Pasta | O que é |
|---|---|
| `firmware/SafeHome_ESP32/` | Sketch do ESP32 que lê MQ-2 (fumaça), MQ-5 (gás natural) e MQ-6 (GLP) e envia por Wi-Fi |
| `backend/` | Servidor Node.js (sem dependências externas). Recebe as leituras e entrega status e histórico ao app |
| `app/` | Aplicativo Ionic 8 (Angular 19, componentes standalone) com as abas Início, Histórico, Alertas e Dispositivo |
| `AWS_PASSO_A_PASSO.md` | Guia para colocar o backend na AWS |

Fluxo:

```
MQ-2 / MQ-5 / MQ-6 → ESP32 → POST /api/gas → backend → GET /api/v1/status → app Ionic
```

O alarme local (LEDs) funciona no ESP32 mesmo sem o servidor. O app mostra "Sem conexão" quando não recebe leituras por 15 segundos.

---

## 1. Testar localmente (sem hardware e sem AWS)

Requisitos: Node.js 20 ou superior.

**Backend**

```powershell
cd backend
node server.js
```

Em outro terminal, simule leituras:

```powershell
cd backend
node simulador.js
```

Testes automatizados do backend (sobe o servidor numa porta temporária):

```powershell
cd backend
npm test
```

Teste rápido:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/status
```

**App**

```powershell
cd app
npm install
npm start
```

Abra `http://localhost:4200`. Na aba **Dispositivo**, confirme o endereço `http://localhost:3000` (padrão) e, se quiser ver tudo sem hardware, ative o **modo demonstração**.

---

## 2. Firmware no ESP32

1. Abra `firmware/SafeHome_ESP32/SafeHome_ESP32.ino` na Arduino IDE 2.x.
2. Preencha `WIFI_SSID`, `WIFI_PASS` e `SERVER_BASE` (endereço **base**, sem `/api/gas`).
   - Teste local: `http://192.168.0.10:3000` (IP do seu PC na rede).
   - Produção: `http://IP_PUBLICO:3000` (ver `AWS_PASSO_A_PASSO.md`).
3. Ajuste `DEVICE_ID` (um por placa: `esp32-1`, `cozinha`, `garagem`...) e, se o servidor usar token, `DEVICE_TOKEN` (mesmo valor de `DEVICE_TOKEN` do backend).
4. Placa: ESP32 Dev Module. Monitor serial: 115200. Grave e acompanhe.

O ESP32 envia a cada 3 s com `device_id` e o cabeçalho `X-Device-Token` (quando configurado).

### Ligações (pinos)

| Função | Pino |
|---|---|
| MQ-2 (fumaça) | GPIO 36 |
| MQ-5 (gás natural) | GPIO 32 |
| MQ-6 (GLP) | GPIO 35 |
| LED verde (normal) | GPIO 25 |
| LED amarelo (atenção / sem Wi-Fi) | GPIO 26 |
| LED vermelho (crítico) | GPIO 27 |
| **Buzzer / sirene** | GPIO 33 |
| **Botão de teste** | GPIO 4 → GND |

A **sirene local toca mesmo sem Wi-Fi e sem servidor** — o alarme não depende da nuvem. O **botão de teste** aciona a sirene e os LEDs por alguns segundos e, se houver rede, avisa o servidor para o app acender junto.

---

## 3. Variáveis do backend

| Variável | Padrão | Função |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `backend/data` | Onde as leituras e eventos são gravados |
| `LIMIAR_FUMACA` | `1500` | Limite ADC do MQ-2 |
| `LIMIAR_GAS_NAT` | `1500` | Limite ADC do MQ-5 |
| `LIMIAR_GAS_BUT` | `1500` | Limite ADC do MQ-6 |
| `OFFLINE_MS` | `15000` | Tempo sem leitura até "Sem conexão" |
| `TESTE_MS` | `12000` | Duração do alerta de teste (botão "Testar alarme" / botão físico) |
| `DEVICE_TOKEN` | (vazio) | Se definido, o ESP32 precisa enviar o cabeçalho `X-Device-Token` com este valor. Sem ele, o POST é aceito de qualquer um na rede |

Leitura a partir de 80% do limite vira **ATENÇÃO**. Igual ou acima do limite vira **CRÍTICO**.

### Contrato da API

| Método | Rota | Quem usa | Descrição |
|---|---|---|---|
| POST | `/api/gas` | ESP32 | Corpo `{"fumaca":1000,"gas_nat":900,"gas_but":950,"device_id":"esp32-1"}` (`device_id` opcional, padrão `esp32-1`). Responde `lido` |
| GET | `/api/v1/status` | App | Estado agregado + lista `devices[]` (um por sensor), com nome, estado e sensores |
| GET | `/api/v1/events?limit=N` | App | Mudanças de estado, da mais nova para a mais antiga (N de 1 a 200) |
| GET | `/api/v1/readings?limit=N&device_id=ID` | App | Últimas leituras brutas de um sensor (N de 1 a 500), usadas no gráfico |
| POST | `/api/v1/selftest` | App | Corpo `{"device_id":"esp32-1"}`. Dispara um alerta de teste por alguns segundos |
| POST | `/api/v1/devices` | App | Corpo `{"device_id":"esp32-1","nome":"Cozinha"}`. Renomeia um sensor |
| GET | `/api/v1/health` | Operação | Servidor no ar, versão e tempo ligado |

---

## 4. O que mudou em relação ao projeto do Felipe

O projeto do Felipe (`SafeGas`) tinha um ESP32 que **servia** a API local, e um app Android nativo (Java/XML) que consumia essa API na mesma rede. Esta versão mantém a ideia de telas, estados e contrato de eventos, mas muda a arquitetura para a nuvem:

| Aspecto | SafeGas (Felipe) | SafeHome (esta pasta) |
|---|---|---|
| App | Android nativo, Java + XML | Ionic (Angular), roda no navegador e pode virar app com Capacitor |
| Quem guarda os dados | ESP32, em RAM | Servidor (local ou AWS), em arquivos |
| Como o app acessa | Mesma rede Wi-Fi via mDNS/IP | Qualquer rede, pelo endereço do servidor |
| Sensores | MQ-2 e MQ-6 | MQ-2, MQ-5 e MQ-6 |
| Estados | Normal, Atenção, Crítico, Sem conexão | Mesmos quatro |
| Modo demonstração | Sim, isolado | Sim, só no app, nada vai ao servidor |
| Limiares | Provisórios | Provisórios (ADC, sem ppm) |

Do projeto do Felipe, foram mantidos: as quatro abas, os estados e rótulos, o modo demonstração separado do histórico real, o aviso de que os valores são provisórios e não calibrados, e o contrato de eventos com número de sequência.

Agora incluídos: sirene local (buzzer, GPIO 33) e botão de teste no ESP32, vários sensores nomeados no app, botão "Testar alarme", notificação no navegador, trava por PIN e modo claro/escuro.

Não foram incluídos ainda: descoberta mDNS, configuração de Wi-Fi pelo próprio ESP32 (portal), atualização OTA, e calibração em ppm.

---

## 5. Pendências

- Confirmar a placa ESP32 exata e os GPIOs. Os pinos 36, 32, 35, 25, 26 e 27 foram mantidos do sketch original. Confirme antes de usar em apresentação.
- Adicionar o buzzer, com o pino e o driver confirmados.
- Calibrar os limiares em ar limpo. Hoje o valor 1500 é provisório.
- Decidir se o app vai ser publicado como APK (Capacitor) e, se sim, validar o acesso HTTP em Android.
- Autenticação no endpoint `/api/gas`. Hoje qualquer um que conheça o endereço consegue enviar dados.

## 6. Aviso de segurança

Este é um protótipo acadêmico. Não é um detector certificado e não substitui equipamento de segurança homologado. Testes com gás ou chama reais exigem laboratório adequado e supervisão. Para demonstração, use o simulador.

---

## 6. Recursos do app

- **Vários sensores**: cada ESP32 manda um `device_id`; o painel lista os sensores por nome (renomeáveis em Dispositivo → Sensores) e mostra o pior estado no topo.
- **Testar alarme**: aba Alertas → "Testar alarme" dispara um alerta de teste no sensor selecionado por ~12 s (o botão físico do ESP32 faz o mesmo).
- **Notificação no navegador**: Dispositivo → Notificações. Avisa quando um sensor fica crítico, mesmo com o app em outra aba. (Aviso completo com o app fechado exige push com service worker — não incluído.)
- **Trava por PIN**: Dispositivo → Segurança. PIN de 4 dígitos, guardado só no aparelho (com hash).
- **Tema**: Sistema / Claro / Escuro (padrão acompanha o aparelho).

## 7. Segurança da comunicação (HTTPS)

Hoje o tráfego é HTTP. Para produção, coloque o backend atrás de um proxy reverso com TLS
(ex.: **Caddy** ou **Nginx + Let's Encrypt**) num domínio, e aponte o app e o `SERVER_BASE`
do firmware para `https://seu-dominio`. O token do dispositivo (`DEVICE_TOKEN`) só deve ser
usado sobre HTTPS, senão ele trafega em texto. Isso exige domínio/certificado, por isso não
vem configurado aqui.
"# safehome" 
