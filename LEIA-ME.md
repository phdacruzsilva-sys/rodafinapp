# RodaFin: app para Android (sem login)

App instalável (PWA). Funciona **offline**, não pede cadastro nem senha, e **os dados ficam só no celular**.

## Como colocar no celular (grátis, cerca de 10 minutos)
O Android só instala o app a partir de um endereço com HTTPS. O jeito mais fácil e gratuito é o GitHub Pages:

1. Crie uma conta em github.com e um repositório **público** chamado `rodafin`.
2. Clique em **Add file > Upload files** e envie todo o conteúdo desta pasta (index.html, app.js, app.css, sw.js, manifest.webmanifest e a pasta icons).
3. Vá em **Settings > Pages**, escolha *Branch: main* e a pasta */ (root)*, e salve.
4. Em 1 a 2 minutos o app estará em `https://SEU-USUARIO.github.io/rodafin/`.
5. No celular, abra o endereço no **Chrome**, toque em **⋮ > Instalar app** (ou *Adicionar à tela inicial*).

Pronto: o ícone do RodaFin aparece na tela inicial e abre em tela cheia, como um app comum.

O código fica público, mas os **dados não**: eles nunca saem do celular. Cada pessoa que instalar tem os próprios dados, separados.

## Quero um arquivo .apk ou publicar na Play Store
Com o app já publicado no GitHub Pages, acesse **pwabuilder.com**, cole o endereço e escolha **Android**. O site gera o pacote para instalar ou enviar à Play Store (publicar na loja exige conta de desenvolvedor Google, com taxa única).

## Backup (importante)
Os dados ficam no armazenamento do Chrome do aparelho. Se você limpar os dados do Chrome, desinstalar o app ou trocar de celular, eles somem.
Use **Mais > Ajustes > Exportar backup** com frequência (dá para enviar direto para o Google Drive ou o WhatsApp) e **Importar backup** para restaurar.

## Atualizar o app
Depois de alterar os arquivos, aumente a versão em `sw.js` (`rodafin-v1` → `rodafin-v2`) e envie de novo ao GitHub. O celular atualiza na próxima vez que abrir o app com internet.

## Como os cálculos funcionam
- **Dia:** começa com o hodômetro inicial e a hora, e termina com o hodômetro final, a hora e as pausas. Km = final − inicial.
- **Custo por km:** calculado de tanque cheio a tanque cheio (R$ abastecido ÷ km rodados). Enquanto não houver dados suficientes, usa o consumo cadastrado do carro.
- **Manutenção:** a previsão usa o ritmo de km/dia dos últimos 30 dias. Uma reserva por km (custo ÷ intervalo) entra como custo do mês.
- **Sobra do Uber:** lucro operacional − compromissos pagos pelo Uber. **Sobra da renda:** rendas fixas − compromissos pagos pela renda.
