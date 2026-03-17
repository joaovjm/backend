# Imagem base Node.js LTS (Alpine para imagem menor)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./



# Instalar apenas dependências de produção (use npm ci para build reproduzível)

RUN npm ci --omit=dev 

# Copiar o código da aplicação
COPY . .

# Remover o diretório node_modules para garantir que as dependências sejam instaladas novamente
RUN rm -rf node_modules/.cache 

# Porta exposta (será sobrescrita por PORT no runtime se necessário)
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "server.js"]
