# منصة الإسكندرية الرقمية
# node:sqlite المدمج محتاج Node 22.5+ — مفيش أي مكتبات native فالبناء بسيط.
FROM node:22-alpine

# tini بيتعامل مع إشارات الإيقاف صح عشان الإغلاق الهادئ يشتغل
RUN apk add --no-cache tini

WORKDIR /app

# طبقة الاعتماديات لوحدها عشان الكاش يشتغل لما الكود بس يتغيّر
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# البيانات والصور على volumes عشان متضيعش مع الحاوية
RUN mkdir -p data uploads backups && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
