+++
title = "Hack télécommande climatiseur (Part 1)"
description = "Commander sa clim via Home Assistant va être plus compliqué que prévus..."
date = 2023-07-16

[taxonomies]
tags = ["hack", "climatiseur", "Home Assistant"]
categories = ["bidouille","électronique"]

[extra]
ToC = true
math = true
+++

# Pourquoi faire ça ?
Cela fait déjà quelque temps que j'ai passé la domotique de la maison sous HomeAssistant. Entre la simplicité d'installation (sur un Raspberry Pi), d'utilisation et surtout l'application pour téléphone (Android & iPhone), c'est juste parfait. Dans un premier temps se fut le contrôle des lumières intérieurs, puis extérieurs (autant en profiter quand on fait les travaux 😄), le bassin des poissons et pour terminer par les prises.

Justement, les prises, parlons-en ! Ce sont de simple prise (probablement acheté sur Amazon à quelques euros), fonctionnant en 433 MHz, rien de sorcier un Arduino, un module RF et la lib qui va bien et hop ! On copie les codes d'allumage et d'extinction, tout va bien !

Bref ! Ma folie de domotisation (_ça se dit ? 🤔_), étant passé je reste avec une bonne impression, beaucoup de câbles tirés, mais dans l'ensemble rien de compliqué...

_Pour être tout à fait honnête je crois que ce qui m'a consommé le plus de temps, était l'intégration de la météo du jour... Pour ne pas s'en servir au final 😒_

Ainsi il y a quelques jours, on se dit que cela serait "vachement bien" de pouvoir allumer/éteindre la clim à distance ! Que ce soit parce qu’on a la flemme de se lever prendre la télécommande (ou pire, monté à l'étage la chercher 😱), ou juste parce qu’on est sorti (il fait 200°C à l'ombre) et qu'on voudrait bien que la chambre soit fraîche en arrivant.

A cet instant très précis, je pensais que cela devait être simple... 

# Les ennuis commencent
La particularité de la télécommande c'est qu'elle fonctionne en [infrarouge](https://fr.wikipedia.org/wiki/Infrarouge)[^1]. Non pas que ce soit particulier pour une télécommande, mais plutôt pour moi (ça fait trèèès longtemps que j'ai plus joué avec de l'infrarouge).

> Bof !...un récepteur, une copie des signaux logiques et on est bon !?
> <div class="author">Moi peu de temps avant le drame</div>

Après quelques minutes (intense) de réflexion, l’idée de copier les codes envoyés par la télécommande c'est avéré être d'une bêtise assez profonde. Pour simplifier les choses, je ne veux que contrôler 3 fonctions :
 1. ON / OFF
 2. La température
 3. Le mode de ventilation

Or, ma climatision me permet d'aller de 16°C à 30°C par tranche de 0.5°C, ce qui fait 29*4 = 116 codes différents (+ 1 pour le mode OFF), ça fait beaucoup... Alors qu'il serait plus simple de comprendre le signal et de l'envoyer en fonction de la température et du mode que je souhaite.

## Observation du signal
Bon n'ayant pas d'analyseur logique, j'ai commencé par utiliser mon oscilloscope et un simple montage utilisant un récepteur infrarouge (VS1838B).

{{figure(src="./img/ensemble.BMP",
       click_to_open=true,
       style="width: 75%;",
       caption="Trame infrarouge -- 1V/div - 25ms/div",
       caption_style="") }}
La trame est plutôt longue (quasiment 150 ms), on peut distinguer deux "parties" dans la trame. Puisqu'elles ne font pas la même taille, ce n'est pas de la redondance, mais bien deux informations distinctes. Pour faire simple, on va appeler la première partie le **header**, et la seconde le **body**.  
Sur l'oscillogramme (je sais... ce mot fait vieux 😄), on peut noter que le signal de séparation est identique au signal du début de la trame, on va donc appeler **start bit**, un état haut long suivi d'un état bas long.

{{figure(src="./img/header.BMP",
       click_to_open=true,
       style="width: 75%;",
       caption="header composé de 9 octets -- 1V/div - 5ms/div",
       caption_style="") }}

Observons le signal de plus près.

{% callout(icon="warning") %}
Le signal présent capturé par l'oscilloscope est inversé. Le montage utilisé pour capturer les trames IR, inverse le signal. Il faut garder à l'esprit (surtout lors de la partie 2), qu'un "état bas" représente un "état haut" pour la LED IR émettrice.  
Pour simplifier la lecture, je vais garder les états présents sur les captures d'écran.
{% end %}

## Comprendre le signal
{{figure(src="./img/donnee.BMP",
       click_to_open=true,
       style="width: 75%;",
       caption="1er octect du header -- 1V/div - 500µs/div",
       caption_style="") }}

Le signal semble être composé d'état bas toujours de même durée (~ 400µs) et d'état haut de durée variable (soit ~ 400µs, soit ~ 1300µs), en plus du _start bit_ observé précédemment. C'est donc en modifiant la durée de l'état haut, que la télécommande peut envoyer des données au format binaires.
> Dans ce cas-là, c'est quoi un '1' c'est quoi un '0' ?
> <div class="author">Un inconnu à l'air cynique</div>

Ben... on ne sait pas justement, alors on va se baser sur ce qui se fait déjà. En cherchant un peu sur internet, il semble ressortir plus souvent qu'un temps sans transmission "court" est un '0' logique et un signal "long" est un '1' logique. Ainsi l'image ci-dessus montre l'émission de 8 bits `01000000`.

Pour être un peu plus précis, il semblerait que les données soit transmises en "LSB-first", c'est-à-dire que le premier bit reçu, est le bit de poids faible (et le dernier celui de poids fort), donc l'octet transmit ci-dessus est : `00000010`.

## Décoder le signal

Chouette ! On sait comment lire le signal, mais il faudrait maintenant le "capturer" et le décoder (comprendre le rôle de chaque bit). Or comme dit plus haut je n'ai (toujours) pas d'analyseur logique et, comme je ne compte pas investir dans les prochains jours, on va faire avec ce que j'ai sous la main.

Oh ! Un ESP8266 que j'avais prévu d'utiliser pour ce projet (ce sera la partie 2 😉) ! Voici le schéma de montage:

{{figure(src="./img/schema_montage.png",
       click_to_open=true,
       style="width: 75%;",
       caption="Schéma de montage de l'ESP (NodeMCU) et du recepteur IR",
       caption_style="") }}

Comme on l'a vu précédemment, l'état bas dure 400µs, ce qui est très court, même pour notre ESP. On va donc découper le programme en deux temps :
 1. Écoute et enregistrement des temps de chaque impulsions (via l'usage des interruptions[^2])
 2. Analyse de la trame enregistrée et affichage au format binaire (plus simple pour décoder, vous allez voir pourquoi 😉)

On ouvre VSCode et on crée un nouveau projet [PlatformIO](https://platformio.org/)
### Ecoute & Enregistrement
```c++
#include <Arduino.h>

constexpr uint16_t RAW_BUFFER_SIZE = 1024;

unsigned long last = 0;
unsigned long raw[RAW_BUFFER_SIZE] = {0};
unsigned raw_idx = 0;

void IRAM_ATTR isr(){
    unsigned long now = micros();

    if( last > 0 ){
        raw[raw_idx++] = now - last;
    }

    last = now;
}

void setup(){
  Serial.begin(115200);
  attachInterrupt(digitalPinToInterrupt(D6), isr, CHANGE);
  *((volatile uint32_t*) 0x60000900) &= ~(1); // Hardware WDT OFF
}

void loop(){
}
```
Bon rien de bien compliqué mais on va reprendre le code pour être sûr de comprendre.

```c++
#include <Arduino.h>

constexpr uint16_t RAW_BUFFER_SIZE = 1024;

unsigned long last = 0;
unsigned long raw[RAW_BUFFER_SIZE] = {0};
unsigned raw_idx = 0;
```

Dans un premier temps on inclut `Arduino.h`, on est dans PlatformIO donc c'est normal. On déclare un constante `RAW_BUFFER_SIZE` qui représente la taille de notre tableau qui enregistrera les temps entre chaque impulsion (1024 est probablement overkill, mais bon je préfère être large 😅). Pour finir on déclare et initialise deux variables, `raw_idx` qui est le prochain indice du tableau dans lequel placer notre mesure et `raw` le tableau dans lequel nous allons stocker nos mesures.

```c++
void IRAM_ATTR isr(){
    unsigned long now = micros();

    if( last > 0 ){
        raw[raw_idx++] = now - last;
    }

    last = now;
}

// ...

void loop() {
}
```
Écartons ensuite les deux fonctions les plus simples. `isr()` sera la fonction appelée lors de l'interruption, elle mesure via [`micros()`](https://www.arduino.cc/reference/en/language/functions/time/micros/)[^3] le temps qu'a durée l'état (haut ou bas), puis place le résultat dans le tableau et termine en incrémentant `raw_idx` de 1. La condition `if( last > 0 )` vérifie s'il s'agit de la première mesure.  
Quant à [`loop`](https://www.arduino.cc/reference/en/language/structure/sketch/loop/) (qui est la fonction appelée perpétuellement par Arduino), elle ne fait rien...

{% callout(icon="info") %}
Pour ceux qui se demandent: "pourquoi ne pas utiliser `digitalRead(...)` dans `loop()` plutôt que les interruptions ?"  
La raison est simple, cette fonction est très longue à s'exécuter, si à cela on ajoute le temps de la comparaison (du `if(...)`) puis le temps d'enregistrement des données, on pourrait "rater" certaines impulsions. _De plus, je trouve le code, avec l'interruption, plus court et plus lisible._
{% end %}

```c++
void setup(){
  Serial.begin(115200);
  attachInterrupt(digitalPinToInterrupt(D6), isr, CHANGE);
  *((volatile uint32_t*) 0x60000900) &= ~(1); // Hardware WDT OFF
}
```
On termine avec le plus important ~la bouffe~, la fonction `setup()`. Une fois encore rien de difficile, on initialise la liaison série, pour avoir un retour de ce qui se passe. Les deux lignes suivantes sont bien plus intéressantes. [`attachInterrupt`](https://www.arduino.cc/reference/en/language/functions/external-interrupts/attachinterrupt/) nous permet d'attacher une interruption sur une **pin**. Dans le cas présent on veut appeler la fonction `isr()` lorsque la pin change d'état (de haut vers bas, ou bas vers haut). Ou dit plus simplement, sur un **front** (_montant_ ou _descendant_).  
L'étrange instruction `*((volatile uint32_t*) 0x60000900) &= ~(1);` permet d'écrire directement dans un registre de l'ESP pour désactiver le ["watchdog"](https://fr.wikipedia.org/wiki/Chien_de_garde_(informatique)). _Je ne vais pas entrer dans les détails, mais la fonction `wdt_disable()` ne marche pas (je ne sais pas pourquoi et je m'en fous un peu pour le moment 🙃)._

### Analyse & Affichage

Maintenant que l'ESP est capable d'enregistrer l'information dont nous avons besoin, il est temps de faire l'analyse et de l'afficher sur le port série. Pour cela on va simplement modifier un peu notre fonction `loop` et ajouter deux nouvelles fonctions.

```c++
// ...
// Déclaration & initialisation des variables/constantes et de la function isr()
//...

void print_binary(uint8_t byte){
  for(int8_t i = 7; i >= 0; --i){
    Serial.print( (byte & (0x01 << i)) > 0 ? "1" : "0" );
  }
}

void analyse_data(){
  uint8_t octets[27] = {0};
  uint8_t id_bit = 0;
  uint8_t id_octet = 0;

  // On saute les deux première mesure (bit de start)
  for( unsigned i = 2; i < RAW_BUFFER_SIZE; i += 2){

    unsigned long low = raw[i];
    unsigned long high = raw[i+1];

    if( low == 0 || high == 0){
      break;
    }
    else if(high > 3000) {
      // Fin du header
      // Saut des deux prochaines données (bit de start)
      i += 2;
    }
    else if( high > 1000 ){
      // bit '1'
      octets[id_octet] |= 1 << id_bit;
      id_bit++;
    }
    else if( high < 600 ) {
      // bit '0'
      id_bit++;
    }
    else{
      Serial.printf("Erreure de trame position %d, (L: %lu, H: %lu)\r\n", i, low, high);
    }

    if( id_bit >= 8 ){
      id_bit = 0;
      id_octet++;
    }
  }

  for(uint8_t i = 0; i < 27; i++ ){
    print_binary(octets[i]);
    Serial.print(" ");
  }
  Serial.println("");
}

// ...
// Fonction setup
// ...

void loop(){
    if( Serial.available() > 0 && Serial.read() == 'p' ){
        analyse_data();
        raw_idx = 0;
        last = 0;

        for( unsigned i = 0; i < RAW_BUFFER_SIZE; ++i){
          raw[i] = 0;
        }
    }
}
```

Cette fois encore on va reprendre le code par morceaux.

```c++
void print_binary(uint8_t byte){
  for(int8_t i = 7; i >= 0; --i){
    Serial.print( (byte & (0x01 << i)) > 0 ? "1" : "0" );
  }
}
```
`print_binary()` permet d'afficher la représentaion binaire de l'argument de la fonction (un entier non-signé sur 8 bits).

```c++
void analyse_data(){
  uint8_t octets[27] = {0};
  uint8_t id_bit = 0;
  uint8_t id_octet = 0;

  // On saute les deux première mesure (bit de start)
  for( unsigned i = 2; i < RAW_BUFFER_SIZE; i += 2){

    unsigned long low = raw[i];
    unsigned long high = raw[i+1];

    if( low == 0 || high == 0){
      break;
    }
    else if(high > 3000) {
      // Fin du header
      // Saut des deux prochaines données (bit de start)
      i += 2;
    }
    else if( high > 1000 ){
      // bit '1'
      octets[id_octet] |= 1 << id_bit;
      id_bit++;
    }
    else if( high < 600 ) {
      // bit '0'
      id_bit++;
    }
    else{
      Serial.printf("Erreure de trame position %d, (L: %lu, H: %lu)\r\n", i, low, high);
    }

    if( id_bit >= 8 ){
      id_bit = 0;
      id_octet++;
    }
  }

  for(uint8_t i = 0; i < 27; i++ ){
    print_binary(octets[i]);
    Serial.print(" ");
  }
  Serial.println("");
}
```

Voici le plus important, `analyse_data()` comme son nom l'indique.... analyse les données...  
La fonction commence avec quelques variables :
 - `octets[27]` : Contient les données finales (il est initialisé avec toutes ses valeurs à 0)
 - `id_bit` : Position du prochain bit à écrire
 - `id_octet` : Position de l'octet en cours d'écriture

Ensuite, le corps de la fonction : une boucle `for` qui va itérer sur toutes les mesures. Puisque les bits sont définis par deux impulsions (basse et haute), on récupère les deux à chaque fois. Les deux premières mesures peuvent être sautées, puisque c'est le _start bit_. On commence par stocker, temporairement, les deux temps dans les variables `low` et `high`, puis on s'en sert pour identifier quelle information ils représentent :
  1. Une des deux données à pour valeur `0`, cela signifie qu'il n'y a plus rien à traiter, on sort de la boucle.
  2. La valeur `high` est supérieure à 3000, c'est la fin du header, on ignore donc ces valeurs plus les deux suivantes du _start bit_.
  3. La valeur `high` est supérieure à 1000 (mais inférieur a 3000), c'est un bit de valeur `1`. On l'enregistre et on incrémente le compteur `id_bit`.
  4. la valeur de `high` est inférieure à 600, c'est un bit de valeur `0`. Le bit en cours vaut dejà 0, on incrémente le compteur `id_bit`
  5. Si aucun des cas suivant n'est le bon, alors on considère que c'est une erreur est on l'affiche.


{% callout(icon="info") %}
Les règles de détection (condition `if`) sont très naïves, mais le but ici n'est pas de recréer un récepteur IR fiable, mais simplement comprendre les trames.
{% end %}

```rust
void loop(){
    if( Serial.available() > 0 && Serial.read() == 'p' ){
        analyse_data();
        raw_idx = 0;
        last = 0;

        for( unsigned i = 0; i < RAW_BUFFER_SIZE; ++i){
          raw[i] = 0;
        }
    }
}
```
Pour terminer, on modifie la fonction `loop` pour y appeler notre fonction d'analyse en envoyant la lettre `p` (minuscule) sur le port série. Une fois l'analyse faites on se prépare pour une nouvelle.

_Si vous voulez un exemple de ce que donnent les valeurs "brut" (avant analyse), [c'est par ici 📄](./exemple_raw_data.txt)_

Pfiouuu... Voilà une bonne chose de faite _\*craquements de dos\*_ ! Il est temps de regarder ce que ça donne !


## Comprendre le signal
> 00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 00110010 10000000 10101111 00000000 00000000 00001110 11100000 00000000 00000000 10001001 00000000 00000000 11100111

Notre première mesure ! Top... mais qu'est ce qu'on en fait ?!
Ben... comme ça, pas grand chose, enfin si. On sait, d'après notre télécommande, que ce signal veut dire :
 - État: Marche
 - Température: 25.0°C
 - Mode de ventilation: AUTO
 - _Tout le reste en mode 'AUTO' (ou du moins les valeurs par défaut, car j'ai réinitialisé la télécommande)_

### La Température
Maintenant pour savoir quel bit représente quoi... il nous faut comparer. Je vais augmenter la température "d'un cran" soit 0.5°C.
> 00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 0011001<span class="diff">1</span> 10000000 10101111 00000000 00000000 00001110 11100000 00000000 00000000 10001001 00000000 00000000 1110<span class="diff">1000</span>  
> <div class="author">État : On - Temperature : 25.5°C - Mode de ventilation : AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Visiblement il y a plusieurs modifications :
 - Le bit 1 de l'octet 15
 - Les bits 4 à 1 de l'octet 27

Ignorons pour le moment l'octet 27, et regardons un peu plus près le 15e: `00110011`.  
Vous le voyez ? Non... attendez je vais le mettre en plus gros $ \large{00110011} $...  
Toujours pas !? Ok... $\small{0}\large{11001}\small{10}$.  
Et oui : 25 en binaire !  

Si notre hypothèse est juste les bits 6 à 2 sont la valeur entière de la température et le bit 1 représente le "demi". Pour vérifier on va encore monter la température de 0.5°C (soit 26.0°C) nous devrions voir `11010` (26 en binaire) pour la partie entière et `0` pour le demi.

>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 00110<span class="diff">100</span> 10000000 10101111 00000000 00000000 00001110 11100000 00000000 00000000 10001001 00000000 00000000 1110100<span class="diff">1</span>  
> <div class="author">État : On - Temperature : 26.0°C - Mode de ventilation : AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

🎉 Parfait !

### Le checksum
Maintenant il reste à comprendre ce qu'est le 27e octet qui change tout le temps... _tout le temps_...  _tout le temps_... ... ...  UN [CHECKSUM](https://fr.wikipedia.org/wiki/Somme_de_contr%C3%B4le) !

En effet, le climatiseur doit pouvoir vérifier si la trame qu'il a reçue est correcte et pour cela le plus simple est d'utiliser un _checksum_. Comme son nom l'indique il s'agit d'une _somme_, mais comme il est codé sur un octet, la valeur finale sera le reste de la division par 256 ($ 2^8 $). Le _header_ (qui ne change jamais) ne rentre pas dans le calcul, uniquement les octets du _body_ son utilisés (et sauf le checksum, évidemment).
$$ checksum = \left( \sum_{i=9}^{26} octet_i \right) \mod 256 $$ 
En prenant comme example notre trame précédente :
$$checksum = 11101001 = (233)\_{10}\newline
\ \newline
00000010 + 00100000 + 11100000 + 00000100 + 00000000 + \newline
00001001 + 00110100 + 10000000 + 10101111 + 00000000 + \newline
00000000 + 00001110 + 11100000 + 00000000 + 00000000 + \newline
10001001 + 00000000 +  00000000 + 11101001 = (1001)\_{10} \newline
\ \newline
1001 \mod 256 = 233$$

### Marche / Arret
Comme pour la température on va procéder exactement de la même manière. En partant de la trame précédente, je vais appuyer sur le bouton pour éteindre la climatisation.

> 00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 0000100<span class="diff">0</span> 00110100 10000000 10101111 00000000 00000000 00001110 11100000 00000000 00000000 10001001 00000000 00000000 1110100<span class="diff">0</span>  
> <div class="author">État: Off - Temperature: 26.0°C - Mode de ventilation: AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Bon... ben voilà... Visiblement l'état (on/off) de la clim est déterminé par 1 seul bit : Le bit 1 de l'octet 14.

On passe à la suite !?

### Mode de ventilation
Ma climatisation possède 3 modes de ventilation:
 - Auto (par défaut)
 - Powerfull
 - Quiet

Regardons les trois trames.

>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 00110100 10000000 10101111 00000000 00000000 00001110 11100000 00000000 00000000 10001001 00000000 00000000 11101001  
> <div class="author">État: On - Température: 26.0°C - Mode de ventilation: AUTO</div>  
>
>   
>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 00110100 10000000 10101111 00000000 00000000 00001110 11100000 0000000<span class="diff">1</span> 00000000 10001001 00000000 00000000 111010<span class="diff">10</span>  
> <div class="author">État: On - Température: 26.0°C - Mode de ventilation: Powerfull <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>  
>
>   
>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000010 00100000 11100000 00000100 00000000 00001001 00110100 10000000 10101111 00000000 00000000 00001110 11100000 00<span class="diff">1</span>0000<span class="diff">0</span> 00000000 10001001 00000000 00000000 <span class="diff">000</span>010<span class="diff">01</span>  
> <div class="author">État: On - Température: 26.0°C - Mode de ventilation: Quiet <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Cela est surprenant, les modes (pourtant mutuellement exclusif) ne sont pas codés sur deux bits consécutifs. Le mode 'powerfull' est contrôlé par le bit 1 de l'octet 22 et le mode 'quiet' par le bit 6. (Je me demande ce qui se passe si c'est deux bits sont à 1 🤔).

{% callout(icon="info") %}
Lors de l'arrêt, la télécommande envoie le mode AUTO, je ne sais pas vraiment pourquoi, mais il faudra le garder à l'esprit lors de l'écriture de notre télécommande.
{% end %}

## La suite
Ce fut long (et encore, j'ai simplifier des trucs 😄), mais on y est arrivé. 
On pourrait répertorier la fonction de chacun des bits de la trame (minuteurs, puissance de ventilation, orientation du flux d'air, ...), mais je n'ai pas besoin de plus pour ce projet. Si l'envie me prend je ferais un post.

La prochaine étape est de contrôler cela à partir d'un ESP8266, embarquant un serveur web sur lequel HomeAssistant pourra envoyer des requêtes...
Bref, tout un programme...

Retrouver le projet PlatformIO, avec le code source sur github: [https://github.com/jnthbdn/ir_sniffer](https://github.com/jnthbdn/ir_sniffer)

On se retrouve pour la partie 2 !

<p class="right">Bidouillez-bien</p>

---
[^1]: un rayonnement invisible pour l'humain, plutôt pratique pour communiqué sur de courte distance

[^2]: Les interruptions permettent de stopper le programme en cours pour exécuter un autre morceau de code.

[^3]: `micros()` retourne le temps en _microsecondes_ depuis le démarrage (ou dernier reset) de l'ESP.