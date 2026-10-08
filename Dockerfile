FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KA_HOST=0.0.0.0 \
    KA_PORT=8000

WORKDIR /app
COPY . /app

# Baza konteyner ichida data/manba dan qayta quriladi.
# Ilova root emas, alohida foydalanuvchi sifatida ishlaydi (ochiq internetda).
RUN rm -f data/kafedra.db \
    && useradd --system --no-create-home --shell /usr/sbin/nologin app \
    && chown -R app /app
USER app

EXPOSE 8000
CMD ["python", "run.py"]
