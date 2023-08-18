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

Bref ! Ma folie de domotisation (ça se dit ? 🤔), étant passé je reste avec une bonne impression, beaucoup de câbles tirés, mais dans l'ensemble rien de compliqué...

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
Bon n'ayant pas d'analyseur logique, j'ai commencé par utiliser mon oscilloscope.
{{figure(src="./ensemble.BMP",
       click_to_open=true,
       style="width: 75%;",
       position="right",
       caption_position="right",
       caption="Trame infrarouge -- 1V/div - 10ms/div",
       caption_style="") }}
La trame est plutôt longue (quasiment 150 ms), maintenant regardons d'un peu plus près la transmission.
{{figure(src="./bit.BMP",
       click_to_open=true,
       style="width: 75%;",
       position="left",
       caption_position="left",
       caption="1 bit de donnée sur une porteuse de 35.7 kHz -- 1V/div - 50µs/div",
       caption_style="") }}
Oooook... Bon visiblement en zoomant sur la plus petite portion de la transmission on obtient...ça. En se posant quelques instants, on observe du "rien" de part et d'autre de 16 impulsions. Nous voilà bien avancés...

Ce qui compte dans la transmission ce ne sont pas les impulsions (enfin... si un peu, mais on verra ça plus tard), ce sont surtout les "riens". Les impulsions représentent la [porteuse](https://fr.wikipedia.org/wiki/Porteuse)[^2], mais en ajoutant les espaces (ou plutôt les temps sans signal) on peut en déduire un **bit**.

## Comprendre le signal
{{figure(src="./donnee.BMP",
       click_to_open=true,
       style="width: 75%;",
       position="right",
       caption_position="right",
       caption="4 bits de donées (0001) -- 1V/div - 250ms/div",
       caption_style="") }}

Maintenant que l'on a compris cela, reste une question à ce poser:
> C'est quoi un '1' c'est quoi un '0' ?
> <div class="author">Un inconnu à l'air cynique</div>

Ben... on ne sait pas justement, alors on va se baser sur ce qui se fait déjà. En cherchant un peu sur internet, il semble ressortir plus souvent qu'un temps sans transmission "court" (~450 µs dans le cas présent) est un '0' logique et un signal "long" (~1300 µs dans le cas présent) est un '1' logique. Ainsi l'image ci-dessus montre l'émission de 4 bits `0001`.

Pour être un peu plus précis, j'ai dit plus haut, que le nombre d'impulsions n'avait pas d'importance. Il y a une petite exception, au début de la trame il y a 130 impulsions suivies d'un temps long sans émission. Ce n'est qu'une en-tête qui ne transporte aucune information.
{{figure(src="./header.BMP",
       click_to_open=true,
       style="width: 75%;",
       position="left",
       caption_position="left",
       caption="en-tête de la trame avec 130 impulsions -- 1V/div - 250ms/div",
       caption_style="") }}

## Décoder le signal

Chouette ! On sait comment lire le signal, mais il faudrait maintenant le "capturer" et le décoder (comprendre le rôle de chaque bit). Or comme dit plus haut je n'ai (toujours) pas d'analyseur logique et, comme je ne compte pas investir dans les prochains jours, on va faire avec ce que j'ai sous la main.

Oh ! Un ESP8266 que j'avais prévu d'utiliser pour ce projet (ce sera la partie 2 😉) !

Comme on l'a vu précédemment, la porteuse est d'environ 35.7 kHz, c'est-à-dire qu'une impulsion dure **28 µS** ($f = \frac{1}{35700} $), ce qui est très court, même pour notre ESP. On va donc découper le programme en deux temps :
 1. Écoute et enregistrement des temps entre les impulsions (via l'usage des interruptions[^3])
 2. Analyse de la trame enregistrée et affichage au format binaire (plus simple pour décoder, vous allez voir pourquoi 😉)

On ouvre VSCode et on crée un nouveau projet [PlatformIO](https://platformio.org/)
### Ecoute & Enregistrement
```c++
#include <Arduino.h>

constexpr unsigned RAW_BUFFER_SIZE = 4096;

volatile unsigned idx = 0;
volatile unsigned long raw[RAW_BUFFER_SIZE] = { 0 };

void IRAM_ATTR isr_low(){
  raw[idx++] = micros();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Ready!");

  attachInterrupt(digitalPinToInterrupt(D1), isr_low, FALLING);  
  *((volatile uint32_t*) 0x60000900) &= ~(1); // Hardware WDT OFF
}

void loop() {
}
```
Bon rien de bien compliqué mais on va reprendre le code pour être sûr de comprendre.

```c++
#include <Arduino.h>

constexpr unsigned RAW_BUFFER_SIZE = 4096;

volatile unsigned idx = 0;
volatile unsigned long raw[RAW_BUFFER_SIZE] = { 0 };
```

Dans un premier temps on inclut `Arduino.h`, on est dans PlatformIO donc c'est normal. On déclare un constante `RAW_BUFFER_SIZE` qui représente la taille de notre tableau qui enregistrera les temps entre chaque impulsion (4096 est probablement overkill, mais bon je préfère être large 😅). Pour finir on déclare et initialise deux variables, `idx` qui est le prochain indice du tableau dans lequel placer notre mesure et `raw` le tableau dans lequel nous allons stocker nos mesures.

```c++

void IRAM_ATTR isr_low(){
  raw[idx++] = micros();
}

// ...

void loop() {
}
```
Écartons ensuite les deux fonctions les plus simples. `isr_low()` sera la fonction appelée lors de l'interruption, elle ne fait rien d'autre que placer la valeur de [`micros()`](https://www.arduino.cc/reference/en/language/functions/time/micros/)[^4] dans le tableau, tout en incrémentant `idx` de 1.  
Quant à [`loop`](https://www.arduino.cc/reference/en/language/structure/sketch/loop/) (qui est la fonction appelée perpétuellement par Arduino), elle ne fait rien...

{% callout(icon="info") %}
Pour ceux qui se demandent: "pourquoi ne pas utiliser `digitalRead(...)` dans `loop()` plutôt que les interruptions ?"  
La raison est simple, cette fonction est très longue à s'exécuter, si à cela on ajoute le temps de la comparaison (du `if(...)`) puis le temps d'enregistrement des données, on va "rater" certaines impulsions. _Ce qui n'est pas très grave dans le cas présent, mais je trouve le code avec l'interruption plus court et plus propre._
{% end %}

```c++
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Ready!");

  attachInterrupt(digitalPinToInterrupt(D1), isr_low, FALLING);  
  *((volatile uint32_t*) 0x60000900) &= ~(1); // Hardware WDT OFF
}
```
On termine avec le plus important ~la bouffe~, la fonction `setup()`. Une fois encore rien de difficile, on initialise la liaison série, pour avoir un retour de ce qui se passe. On attend un peu puis on affiche un message pour dire que tout est prêt. Les deux lignes suivantes sont bien plus intéressantes. [`attachInterrupt`](https://www.arduino.cc/reference/en/language/functions/external-interrupts/attachinterrupt/) nous permet d'attacher une interruption sur une **pin**. Dans le cas présent on veut appeler la fonction `isr_low()` lorsque la pin passe de l'état "haut" ('1' logique) à l'état "bas" ('0' logique), autrement dit sur une **front descendant**.  
L'étrange instruction `*((volatile uint32_t*) 0x60000900) &= ~(1);` permet d'écrire directement dans un registre de l'ESP pour désactiver le ["watchdog"](https://fr.wikipedia.org/wiki/Chien_de_garde_(informatique)). _Je ne vais pas entrer dans les détails, mais la fonction `wdt_disable()` ne marche pas (je ne sais pas pourquoi et je m'en fous un peu pour le moment 🙃)._

### Analyse & Affichage

Maintenant que l'ESP est capable d'enregistrer l'information dont nous avons besoin, il est temps de faire l'analyse et de l'afficher sur le port série. Pour cela on va simplement modifier un peu notre fonction `loop` et ajouter deux nouvelles fonctions.

```c++

// Déclaration & initialisation des variables/constantes

void print_binary(uint8_t byte){
  for(int8_t i = 7; i >= 0; --i){
    Serial.print( (byte & (0x01 << i)) > 0 ? "1" : "0" );
  }
}

void analyse_data(){

  uint8_t data[512] = { 0 };
  unsigned long previous = raw[0];
  unsigned long delta_t = 0;
  unsigned count = 0;
  unsigned data_idx = 0;

  uint8_t byte = 0;

  for( unsigned i = 0; i < RAW_BUFFER_SIZE; ++i){
    delta_t = raw[i] - previous;

    if( delta_t > 300 ){
      if ( count >= 16  & count <= 18 ){

        byte |= ((delta_t > 500) ? 1 : 0) << data_idx;
        data_idx++;

        if(data_idx % 8 == 0){
          print_binary(byte);
          Serial.print(" ");
          byte = 0;
          data_idx = 0;
        }
      }

      count = 0;
    }


    count += 1;
    previous = raw[i];
  }

  if( count > 0 ){
    print_binary(byte);
  }

  Serial.println("");
}

// ...
// Fonction setup
// ...

void loop() {
  if( Serial.available() > 0 && Serial.read() == 'p'){
    analyse_data();

    idx = 0;
    for(unsigned i = 0; i < RAW_BUFFER_SIZE; ++i) { raw[i] = 0; }
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
`print_binary()` permet d'afficher la représentaion binaire de l'argument de la fonction (qui est un entier non-signé sur 8 bits).

```c++

void analyse_data(){
  unsigned long previous = raw[0];
  unsigned long delta_t = 0;
  unsigned count = 0;
  unsigned data_idx = 0;

  uint8_t byte = 0;

  for( unsigned i = 0; i < RAW_BUFFER_SIZE; ++i){
    delta_t = raw[i] - previous;

    if( delta_t > 300 ){
      if ( count >= 16  & count <= 18 ){

        byte |= ((delta_t > 500) ? 1 : 0) << data_idx;
        data_idx++;

        if(data_idx % 8 == 0){
          print_binary(byte);
          Serial.print(" ");
          byte = 0;
          data_idx = 0;
        }
      }

      count = 0;
    }


    count += 1;
    previous = raw[i];
  }

  if( count > 0 ){
    print_binary(byte);
  }

  Serial.println("");
}
```
Voici le plus important, `analyse_data()` comme son nom l'indique.... analyse les données...  
La fonction commence avec quelques variables:
 - `previous` : Contient le temps de l'impulsion précédente
 - `delta_t` : Représente la différence entre la mesure actuellement traitée et la précédente
 - `count` : Le compteur d'impulsion
 - `data_idx` : Contient le bit dans lequel stocker notre donnée final
 - `byte` : Utilisé pour construire notre entier sur 8 bits

On attaque ensuite le corps de la fonction, une boucle `for` qui va itérer sur toutes les mesures faites précédemment. On calcule la différence de temps et on stocke cela dans `delta_t` (pour la 1er itération la différence vaudra 0).  
Notre premier `if` verifie si `delta_t` est supérieur à 300 µs, indiquant qu'un bit vient de nous être transmit. Juste après, on contrôle si on a eu (environ) 16 impulsions (car dans le cas où c'est le paquet d'en-tête on l'ignore simplement). Si c'est le cas alors suivant le temps d'attente on **enregistre** un 1 ou un 0 via `byte |= ((delta_t > 500) ? 1 : 0) << data_idx` (`|=` et `<<` sont des [opérateurs logique](https://fr.wikipedia.org/wiki/Op%C3%A9rateur_(informatique)#Exemples) permettant de construire notre entier non-signé de 8 bits).  
Ouf... le plus dur est passé !  
la condition suivante `if(data_idx % 8 == 0)` ne sert qu'à afficher notre octet si celui-ci est "plein" et remettre les variables à zéro, pour recommencer.  
Enfin `count` repart à zéro car on vient de traiter ces impulsions.  
Les deux dernières lignes de la boucle `for` compte l'impulsion et enregistre le temps pour le calcule suivant.

Pour terminer on vérifie que l'on n'a pas d'octet "en cours", sinon on l'affiche, et on saute une ligne pour faire jolie.

```c++

void loop() {
  if( Serial.available() > 0 && Serial.read() == 'p'){
    analyse_data();

    idx = 0;
    for(unsigned i = 0; i < RAW_BUFFER_SIZE; ++i) { raw[i] = 0; }
  }
}
```
Pour terminer, on modifie la fonction `loop` pour y appeler notre fonction d'analyse en envoyant la lettre `p` (minuscule) sur le port série. Une fois l'analyse faites on se prépare pour une nouvelle.

Pfiouuu... Voilà une bonne chose de faite _\*craquements de dos\*_ ! Il est temps de regarder ce que ça donne !

## Comprendre le signal
> 00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 01100100 00000000 01011111 00000001 00000000 00011100 11000000 00000001 00000000 00010010 00000001 00000000 11001110 00000011

Notre première mesure ! Top... mais qu'est ce qu'on en fait ?!
Ben... comme ça, pas grand chose, enfin si. On sait, d'après notre télécommande, que ce signal veut dire :
 - État: Marche
 - Température: 25.0°C
 - Mode de ventilation: AUTO
 - _Tout le reste en mode 'AUTO' (ou du moins les valeurs par défaut, car j'ai réinitialisé la télécommande)_

{% callout(icon="info") %}
Le dernier octet `00000011` n'en est pas un, la trame se termine avec deux bits seulement (`11`).  
Notons également que la trame est transmise en LSB first (Low significant bit first).
{% end %}

### La Température
Maintenant pour savoir quel bit représente quoi... il nous faut comparer. Je vais augmenter la température "d'un cran" soit 0.5°C.
> 00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 011001<span class="diff">1</span>0 00000000 01011111 00000001 00000000 00011100 11000000 00000001 00000000 00010010 00000001 00000000 110<span class="diff">1000</span>0 00000011  
> <div class="author">État : On - Temperature : 25.5°C - Mode de ventilation : AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Visiblement il y a plusieurs modifications :
 - Le bit 2 de l'octet 15
 - Les bits 5 à 2 de l'octet 27

Ignorons pour le moment l'octet 27, et regardons un peu plus près le 15e: `01100110`.  
Vous le voyez ? Non... attendez je vais le mettre en plus gros $ \large{01100110} $...  
Toujours pas !? Ok... $\small{0}\large{11001}\small{10}$.  
Et oui : 25 en binaire !  

Si notre hypothèse est juste les bits 7 à 3 sont la valeur entière de la température et le bit 2 représente le "demi". Pour vérifier on va encore monter la température de 0.5°C (soit 26.0°C) nous devrions voir `11010` (26 en binaire) pour la partie entière et `0` pour le demi.

>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 011<span class="diff">010</span>00 00000000 01011111 00000001 00000000 00011100 11000000 00000001 00000000 00010010 00000001 00000000 110100<span class="diff">1</span>0 00000011  
> <div class="author">État : On - Temperature : 26.0°C - Mode de ventilation : AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

🎉 Parfait !

### Le checksum
Maintenant il reste à comprendre ce qu'est le 27e octet qui change tout le temps... _tout le temps_...  _tout le temps_... ... ...  UN [CHECKSUM](https://fr.wikipedia.org/wiki/Somme_de_contr%C3%B4le) !  
En effet, le climatiseur doit pouvoir vérifier si la trame qu'il a reçue est correcte et pour cela le plus simple est d'utiliser un checksum.  
Je ne vais pas faire durer le suspense plus longtemps. D'après mes observations le checksum peut être calculé de deux manières différentes:
 1. (Complexe) En calculant l'inverse du complément à deux de la somme des octets de 10 à 26 modulo 1024[^5] : $$ \neg \left( \left( \sum_{i=10}^{26} octet_i \mod 1024 \right) + 1 \right) $$ 
 2. (Simple) On soustrait 1 à la somme des octets de 10 à 26

Étant donnée que ça revient au même.... on va soustraire 1.


{% callout(icon="warning") %} 
Par contre, il y a une étrange subtilité (ou alors j'ai raté quelque chose, ce qui n'est pas impossible), mais les deux derniers bits de poids fort (le 9e & 10e), sont inversés (au sens logique).  
De plus, la transmission étant LSB-first le dernier octet représente les bits de poids forts du checksum, l'avant dernier les bits de poids faibles.
{% end %}

### Marche / Arret
Comme pour la température on va procéder exactement de la même manière. En partant de la trame précédente, je vais appuyer sur le bouton pour éteindre la climatisation.

>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 000100<span class="diff">0</span>0 01101000 00000000 01011111 00000001 00000000 00011100 11000000 00000001 00000000 00010010 00000001 00000000 110100<span class="diff">0</span>0 00000011  
> <div class="author">État: Off - Temperature: 26.0°C - Mode de ventilation: AUTO <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Bon... ben voilà... Visiblement l'état (on/off) de la clim est déterminé par 1 seul bit : Le bit 2 de l'octet 14.

La suite ?

### Mode de ventilation
Ma climatisation possède 3 modes de ventilation:
 - Auto (par défaut)
 - Powerfull
 - Quiet

Regardons les trois trames.

>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 01100100 00000000 01011111 00000001 00000000 00011100 11000000 00000001 00000000 00010010 00000001 00000000 11001110 00000011  
> <div class="author">État: On - Température: 26.0°C - Mode de ventilation: AUTO</div>  
>
>   
>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 01100100 00000000 01011111 00000001 00000000 00011100 11000000 000000<span class="diff">1</span>1 00000000 00010010 00000001 00000000 11010000 00000011  
> <div class="author">État: Off - Température: 26.0°C - Mode de ventilation: Powerfull <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>  
>
>   
>00000010 00100000 11100000 00000100 00000000 00000000 00000000 00000110 00000101 01000000 11000000 00001001 00000000 00010010 01100100 00000000 01011111 00000001 00000000 00011100 11000000 0<span class="diff">1</span>0000<span class="diff">0</span>1 00000000 00010010 00000001 00000000 <span class="diff">00</span>0<span class="diff">0111</span>0 0000001<span class="diff">0</span>  
> <div class="author">État: Off - Température: 26.0°C - Mode de ventilation: Quiet <br/><i class="tiny">En rouge les différences avec la trame précédente</i></div>

Cela est surprenant, les modes (pourtant mutuellement exclusif) ne sont pas codés sur deux bits consécutifs. Le mode 'powerfull' est contrôlé par le bit 2 de l'octet 22 et le mode 'quiet' par le bit 7. (Je me demande ce qui se passe si c'est deux bits sont à 1 🤔).

## La suite
Ce fut long (et encore, j'ai simplifier des trucs 😄), mais on y est arrivé. 
On pourrait répertorier la fonction de chacun des bits de la trame (minuteurs, puissance de ventilation, orientation du flux d'air, ...), mais je n'ai pas besoin de plus pour ce projet. Si l'envie me prend je ferais un post.

La prochaine étape est de contrôler cela à partir d'un ESP8266, embarquant un serveur web sur lequel HomeAssistant pourra envoyer des requêtes...
Bref, tout un programme...

On se retrouve pour la partie 2 !

<p class="right">Bidouillez-bien</p>

---
[^1]: un rayonnement invisible pour l'humain, plutôt pratique pour communiqué sur de courte distance

[^2]: Onde de fréquence fixe, sur laquelle les données sont transmises  

[^3]: Les interruptions permettent de stopper le programme en cours pour exécuter un autre morceau de code.

[^4]: `micros()` retourne le temps en _microsecondes_ depuis le démarrage (ou dernier reset) de l'ESP.

[^5]: 1024 car le checksum est codé sur un octet (10 bits).