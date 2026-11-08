## Read Flow, sistema de gestión de lectura para tu kindle

esto al final
me presento: mi nombre es Alexander Granados, desarrollador de software, 6 años desarrollando.

---

la problemática que resuelve Read Flow.

el problemas: los sistemas son buenos pero solo si no te llevan tanto tiempo

Este año quería enfocarme mucho más en la lectura y me di cuenta de algo interesante. Primero tenía que comprar el e-book y luego enviarlo al Kindle. No tenía que hacer eso porque primero me gusta tener los e-books propios y no depender del sistema de Amazon, ya que no eres propietario sino que básicamente solo compras una licencia. Eso no me gusta, entonces lo compro en otra plataforma y ahí los pongo.

Me di cuenta de algo muy manual que tenía que hacer y era esto:

1. En Notion tenía la lista de libros que quería leer.
2. De ahí iba sacando los e-books de cada lectura.
3. Ese e-book lo guardaba en Drive para no perderlo.
4. Generaba un link para guardarlo también y enlazarlo con Notion.
5. A Notion le creaba la metadata del libro para tener el nombre del libro, cover, autor, etc.
6. Enviaba el e-book por correo al Kindle.
7. Cuando terminaba la lectura tenía que marcarlo en Notion como terminado.

Eran unos pasos muy manuales que dije y, si se puede, automatizar. O sea, Libro me trae toda la metadata del libro porque, cuando tú lo importas, te aparece el cover y toda la información. Para enviarlo a través de correo, obviamente puedes hacerlo mediante API lo mismo con notion

Dicho esto empecé a buscar alternativas para hacerlo un poco más automático y no tener que hacer pasos tan manuales. Ahí creé esta primera versión, que es en n8n y es un flujo, y me funciona bastante bien. A día de hoy lo sigo utilizando

---

acá en esta parte ahora la aplicación: hago un demo corto con el libro Sobre la brevedad de la vida de Séneca, que ya lo tengo en Downloads, y muestro el funcionamiento y todo.

---

cómo la construí

Lo primero es cómo es el MVP, lo mínimo viable, o cómo sería el scope mínimo, pero tampoco yéndome al extremo. No sé cómo nombrar esta parte: el alcance. Quería hacer lo mismo que aguarita pero sin llevarlo al extremo.

Dicho esto tenemos cómo lo construí y las tecnologías:

- El frontend lo hice en Astron y para los estilos utilicé Tailwind.
- En el backend utilicé Python.
- Obviamente toda la infraestructura en AWS, desplegada con CDK.

Los recursos que utilicé fueron:

- Amplify Hosting
- Amazon Cognito
- events sync
- API Gateway
- Lambda
- S3 Pocket
- DynamoDB
- SES para envío de correos
  Route 53 para el dominio, el despliegue continuo a través de GitHub Actions

claude desktop para ui
claude code para contruir

en esta parte sería bueno mostrar el diagrama de arquitectura a través de Drawio y creo que sería más fácil explicar esta parte.
Importante: en el rayo, poner el esquema de cómo está la tabla de Dynamo para así hacer la idea de qué metadata guarda el libro y, sí, los datos.

mencionar los costes finales de la aplicación, que son súper económicos. También mencionarlo acá.

---

lo que aprendí, entonces, lo primero fue que ya me familiaricé mucho con la infraestructura detrás de Secam. La verdad es algo que me voló la cabeza y me encantó.

De ahí aprendí a configurar varios recursos con los que no tenía ni idea, como por ejemplo Amplify, Nito, colas en SQS y envío de emails. También aprendí cómo desarrollar con IA. Eso fue algo interesante. Vi dos charlas acá: una que compartieron a través de acá y otra de Marcia con Kiro. También fue muy interesante ver que lo hacía bien y ver algunas cositas que me faltaba por mejorar.

Sobre las mejoras futuras:

- Voy a seguir utilizando la plataforma. La verdad me encantó y creo que voy a migrar lo que tenía hacia acá.
- El tema de agregar los highlights de Kindle para pasarlos de Kindle acá y luego importarlos en mi cerebro digital. Ya tengo ideas de cómo hacerlo y estaré viendo cuál es la mejor opción para hacerlos llegar acá más fácilmente.

---

y la conclusión sería:

1. Crear un producto a día de hoy no es tan complicado. Creo que hay que animarse a crearlo, ya que la IA te ayuda muchísimo. Primero obviamente hay que entender muy bien las cosas. Eso es lo primero: sí lo construye, pero con cabeza.
2. Tampoco hay que tenerle tanto miedo a Wesson. Yo también era de los muchos que le teníamos mucho miedo. Aún no lo sigo teniendo pero era mucho miedo y uno no sabía qué hacer ahí. Solo es cuestión de práctica y leer sobre los recursos. También ayuda mucho en comunidades como esta, que te dan muchos tips y aprendes bastante de AWS.
