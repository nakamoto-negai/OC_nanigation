FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite proxy proxy_http proxy_wstunnel ssl headers expires

COPY app.conf /etc/apache2/sites-available/app.conf
RUN a2dissite 000-default.conf && a2ensite app.conf

EXPOSE 80 443

CMD ["apache2ctl", "-D", "FOREGROUND"]
