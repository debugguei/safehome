# SafeHome: passo a passo para colocar o servidor na AWS

Este guia sobe a pasta `backend/` em uma máquina EC2 (Ubuntu), deixa o servidor rodando sozinho e expõe ele pela porta 80. Depois disso, o ESP32 e o app Ionic apontam para o endereço público.

Tempo estimado: 30 a 45 minutos.

---

## Antes de começar

- Uma conta AWS com cobrança ativada. Use a região que preferir (ex.: `sa-east-1`, São Paulo).
- Um cartão ou método de pagamento cadastrado. A instância `t3.micro` costuma entrar no Free Tier, mas confira em **Billing > Free Tier** no seu caso.
- No computador Windows: PowerShell (já vem instalado) e o OpenSSH cliente (em **Configurações > Aplicativos > Recursos opcionais**, procure "Cliente OpenSSH").

> Nunca envie a chave `.pem` nem senhas para o GitHub ou para o grupo.

---

## Etapa 1: criar a chave de acesso (key pair)

1. Entre no **console AWS** e pesquise **EC2**.
2. No menu lateral: **Rede e segurança > Pares de chaves** (*Key pairs*) > **Criar par de chaves**.
3. Nome: `safehome-chave`. Tipo: **RSA**. Formato: **.pem**.
4. Clique em **Criar**. O arquivo `safehome-chave.pem` é baixado. Guarde em um lugar seguro, por exemplo `C:\Users\rafae\.ssh\safehome-chave.pem`.

---

## Etapa 2: criar o grupo de segurança (firewall)

1. **EC2 > Rede e segurança > Grupos de segurança > Criar grupo de segurança**.
2. Nome: `safehome-sg`. Descrição: `Acesso SafeHome`. VPC: deixe a padrão.
3. Em **Regras de entrada**, adicione:

| Tipo | Porta | Origem | Para que serve |
|---|---|---|---|
| SSH | 22 | **Meu IP** | Você acessar o servidor pelo terminal |
| HTTP | 80 | 0.0.0.0/0 | ESP32 e app acessam a API |

4. Deixe as regras de saída como estão e clique em **Criar grupo de segurança**.

> Use **Meu IP** no SSH. Se usar `0.0.0.0/0` na porta 22, qualquer pessoa pode tentar entrar no servidor.

---

## Etapa 3: criar a instância EC2

1. **EC2 > Instâncias > Executar instância**.
2. Nome: `safehome-servidor`.
3. Imagem (AMI): **Ubuntu Server 24.04 LTS**.
4. Tipo de instância: **t3.micro** (ou `t2.micro`, conforme aparecer como elegível no Free Tier).
5. Par de chaves: `safehome-chave`.
6. Configurações de rede: **Selecionar grupo de segurança existente** > `safehome-sg`. IP público: **Habilitar**.
7. Armazenamento: 8 GB gp3 é suficiente.
8. Clique em **Executar instância** e aguarde o estado **Em execução**.

### Fixe o IP público (recomendado)

Sem isso, o IP muda sempre que a instância é parada e iniciada, e o ESP32 perde o endereço.

1. **EC2 > Rede e segurança > IPs elásticos > Alocar endereço IP elástico**.
2. Depois de criado, selecione o IP > **Ações > Associar endereço IP elástico** > escolha `safehome-servidor`.
3. Anote esse IP. Ele será usado em todo o restante do guia como **IP_PUBLICO**.

> IP elástico não associado a uma instância em execução gera cobrança. Se apagar a instância, libere o IP também.

---

## Etapa 4: conectar no servidor pelo Windows

No PowerShell, dentro da pasta onde está a chave:

```powershell
ssh -i "C:\Users\rafae\.ssh\safehome-chave.pem" ubuntu@IP_PUBLICO
```

Se aparecer erro de permissão na chave (`UNPROTECTED PRIVATE KEY FILE`), ajuste as permissões no PowerShell:

```powershell
icacls "C:\Users\rafae\.ssh\safehome-chave.pem" /inheritance:r
icacls "C:\Users\rafae\.ssh\safehome-chave.pem" /grant:r "$($env:USERNAME):R"
```

Na primeira conexão, responda `yes`. Você está no servidor quando o prompt mudar para `ubuntu@ip-...`.

---

## Etapa 5: instalar Node.js, Nginx e PM2

Dentro do servidor (SSH):

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm install -g pm2
node -v
npm -v
```

`node -v` deve mostrar `v20.x`.

---

## Etapa 6: enviar a pasta `backend/` para o servidor

Abra **outro** PowerShell no computador (não feche o SSH):

```powershell
cd "C:\Users\rafae\Downloads\SafeHome_Final"
scp -i "C:\Users\rafae\.ssh\safehome-chave.pem" -r .\backend ubuntu@IP_PUBLICO:/home/ubuntu/safehome
```

Volte ao SSH e confira:

```bash
ls /home/ubuntu/safehome
```

Deve aparecer `server.js`, `package.json` e `simulador.js`.

---

## Etapa 7: testar o servidor manualmente

```bash
cd /home/ubuntu/safehome
PORT=3000 node server.js
```

Você deve ver `SafeHome backend v1.0.0 na porta 3000`. Em outra aba do SSH:

```bash
curl -X POST http://localhost:3000/api/gas -H "Content-Type: application/json" -d '{"gas_nat":900,"fumaca":1000,"gas_but":950}'
curl http://localhost:3000/api/v1/status
```

A primeira resposta deve ser `lido`. Pare o servidor com `Ctrl + C` antes de seguir.

---

## Etapa 8: deixar o servidor rodando sozinho (PM2)

```bash
cd /home/ubuntu/safehome
pm2 start server.js --name safehome --time
pm2 save
pm2 startup systemd
```

O comando `pm2 startup` mostra uma linha que começa com `sudo env PATH=...`. **Copie essa linha inteira, cole e execute.** Ela faz o PM2 subir junto com a máquina.

Comandos úteis:

```bash
pm2 status          # mostra se está online
pm2 logs safehome   # acompanha o que chega do ESP32
pm2 restart safehome
```

---

## Etapa 9: expor o servidor pela porta 80 (Nginx)

Crie o arquivo de configuração:

```bash
sudo nano /etc/nginx/sites-available/safehome
```

Cole exatamente:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 4k;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

Salve (`Ctrl + O`, `Enter`, `Ctrl + X`). Depois ative:

```bash
sudo ln -s /etc/nginx/sites-available/safehome /etc/nginx/sites-enabled/safehome
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`sudo nginx -t` deve dizer `syntax is ok` e `test is successful`.

---

## Etapa 10: testar de fora da AWS

No PowerShell do seu computador (não do servidor):

```powershell
Invoke-RestMethod http://IP_PUBLICO/api/v1/health
Invoke-RestMethod http://IP_PUBLICO/api/v1/status
```

Se o `health` responder `status: OK`, o servidor está público. Se der timeout:

1. Confira no grupo de segurança se a porta 80 está liberada.
2. Confirme que o PM2 está `online` (`pm2 status`).
3. Confirme que o Nginx está ativo (`sudo systemctl status nginx`).

---

## Etapa 11: apontar o ESP32 para a AWS

No arquivo `firmware/SafeHome_ESP32/SafeHome_ESP32.ino`, altere:

```cpp
const char* WIFI_SSID = "NOME_DA_SUA_REDE";
const char* WIFI_PASS = "SENHA_DA_SUA_REDE";
const char* SERVER_URL = "http://IP_PUBLICO/api/gas";
```

Grave no ESP32 pela Arduino IDE (placa: a sua placa ESP32 DevKit, porta COM correta). No Monitor Serial (115200 bauds) você deve ver linhas do tipo:

```
HTTP: 200 | Resposta: 'lido' | {"gas_nat":...,"fumaca":...,"gas_but":...}
```

Se aparecer `HTTP: -1` ou outro código negativo, o ESP32 não alcançou o servidor. Confira o IP, a porta e se o Wi-Fi conectou.

---

## Etapa 12: conferir no servidor

No SSH:

```bash
pm2 logs safehome --lines 20
```

Você deve ver as leituras chegando a cada 3 segundos. Os dados ficam em `/home/ubuntu/safehome/data/`:

- `leituras.ndjson`: todas as leituras recebidas.
- `eventos.ndjson`: mudanças de estado (NORMAL, ATENÇÃO, CRÍTICO, SEM CONEXÃO).

---

## Etapa 13: conectar o app Ionic

1. No computador, dentro da pasta `app/`:

```powershell
npm install
npm start
```

2. Abra `http://localhost:4200` no navegador.
3. Aba **Dispositivo** > campo **Endereço do servidor** > digite `http://IP_PUBLICO` > **Salvar e conectar**.

> **Atenção com HTTPS:** se você hospedar o app em um endereço `https://`, o navegador bloqueia chamadas para `http://` (conteúdo misto). Para o protótipo, rode o app localmente com `npm start`. Para usar HTTPS de verdade, é preciso um domínio apontado para o IP e um certificado (Let's Encrypt), o que está fora deste guia.

---

## Etapa 14 (opcional): testar sem o ESP32

Enquanto o hardware não estiver pronto, rode o simulador no seu computador (ou no servidor):

```powershell
cd backend
$env:SERVER_URL="http://IP_PUBLICO"
node simulador.js
```

O simulador envia leituras de teste a cada 3 segundos, passando por normal, atenção e crítico. As leituras são marcadas como simuladas.

---

## Atualizar o servidor depois de mudanças

Depois de alterar o `server.js`, envie de novo e reinicie:

```powershell
scp -i "C:\Users\rafae\.ssh\safehome-chave.pem" .\backend\server.js ubuntu@IP_PUBLICO:/home/ubuntu/safehome/
```

```bash
pm2 restart safehome
```

---

## Custos e cuidados

- Desligue a instância (**Estado > Parar**) quando não estiver usando. Lembre que o IP elástico continua cobrado se não estiver associado a uma instância em execução.
- Crie um alarme de cobrança em **Billing > Budgets**, com limite de R$ 20, por exemplo.
- Faça backup da pasta `data/` antes de encerrar o projeto.
- O servidor não tem autenticação. Ele aceita qualquer POST em `/api/gas`. Para o protótipo acadêmico isso basta, mas não deixe o endereço público depois da apresentação se não for necessário.

---

## Resumo rápido do que ficou no ar

| Item | Valor |
|---|---|
| Servidor | `http://IP_PUBLICO` |
| Envio do ESP32 | `POST http://IP_PUBLICO/api/gas` (responde `lido`) |
| Status para o app | `GET http://IP_PUBLICO/api/v1/status` |
| Eventos para o app | `GET http://IP_PUBLICO/api/v1/events?limit=50` |
| Saúde do servidor | `GET http://IP_PUBLICO/api/v1/health` |
| Processo | PM2, nome `safehome`, sobe com a máquina |
| Logs | `pm2 logs safehome` |
