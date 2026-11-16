# Frontend container: nginx serves the HTML, CSS, JS and images, and forwards
# /api to the backend container (see nginx.conf). Built from the repository root.
FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY html /usr/share/nginx/html/html
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY assets /usr/share/nginx/html/assets

EXPOSE 80
