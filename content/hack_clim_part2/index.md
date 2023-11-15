+++
title = "Hack télécommande climatiseur (Part 2)"
description = "Une fois le principe de fonctionnement acquis, il temps de coder !"
date = 2023-09-10

[taxonomies]
tags = ["hack", "climatiseur", "Home Assistant", "code", "esp"]
categories = ["bidouille", "électronique"]

[extra]
ToC = true
math = true
+++

# Previously
Dans [l'article précédent](@/hack_clim_part1/index.md), nous avons découvert et décoder le protocole infrarouge utilisé par la télécommande du climatiseur. Maintenant que l'on connaît les bits et les octets à modifier, il est temps de programmer notre ESP.

# La porteuse... ça vous dit ?
Dans les oscillogrammes de l'article précédent, nous pouvions observer des signaux (haut ou bas) bien lisses. C'est extrêmement pratique pour comprendre ce qui se passe et décoder les informations qui transitent, mais je dois vous avouer que ce n'est pas la réalité ! (_\*tan   tan   tan\*_).

Si l'on observe le signal produit par la LED on devrait obtenir quelque chose de beaucoup plus "haché", on dit que le signal **module la porteuse**. Dans le cas de notre télécommande la porteuse est de 38kHz.

{{figure(src="./img/bit.BMP",
       click_to_open=true,
       style="width: 75%;",
       caption="1 bit sur une porteuse de 32kHz -- 1V/div - 5ms/div",
       caption_style="") }}

{%callout(icon="🐞")%}
Il y a une petite erreur sur l'image... Je me suis planté en plaçant le curseur, le $\Delta T$ ne vaut pas 28µs mais 26µs.
$$
    \Delta T = \frac{1}{Freq_{porteuse}} = \frac{1}{38000} \approx 0.000026316 \Rightarrow 26.3µs
$$
{%end%}

## Pourquoi utiliser une porteuse en Infrarouge ?

Puisqu'il n'y a souvent qu'un seul "unité intérieure" de climatisation, il serait légitime de se demander pourquoi se compliquer en utilisant une porteuse, alors qu'un signal direct pourrait tout aussi bien marcher.

### Cas d'usage
Il y a deux cas (principaux) dans lesquels on veut utiliser une porteuse :
1. La transmission par ondes électromagnétiques : En utilisant la porteuse comme onde "de transport", les caractéristiques de transmission (distance, puissance, ...) seront celles de la porteuse. Cela permettra aussi "d'isoler" la fréquence que l'on souhaite recevoir (par exemple la radio, la fréquence de la station est en réalité la porteuse).
2. La transmission de plusieurs informations via le même support physique : En utilisant plusieurs porteuses, on peut, sans perte et sans collision (normalement), transmettre plusieurs informations différentes en même temps (par exemple, pour les vieux, la télévision par câble. Un seul câble, mais plusieurs chaînes)

Dit comme ça, l'utilité ne semble pas très claire... Pourtant, dans en infrarouge, plus précisément dans le contexte qui est le nôtre, c'est le cas n°1 qui nous intéresse.

### Un bain de lumière
L'infrarouge, je ne vous apprends rien, est de la lumière. Pour aller un peu plus dans les détails, le spectre IR est très large, tellement large qu'on l'a découpé en trois **régions**[^1] en fonction de leurs longueurs d'ondes :
 * Infrarouge _proche_ : de 0.78µm à 3µm
 * Infrarouge _moyen_ : de 3µm à 50µm
 * Infrarouge _lointain_ : de 50µm à 5mm 😳

{% callout(icon="info") %}
Pour rappel, la lumière est une onde (_doucement les physiciens ! Je simplifie..._), et comme toutes les ondes, elles ont une **fréquence**. La fréquence est le **nombre de fois** qu'un signal se répète pendant _1 seconde_ (100 Hz => 100 répétitions par secondes). Mais on peut aussi exprimer la **longueur d'onde** qui est le **temps** entre deux répétitions. 

À mesure que la fréquence augmente, la longueur d'onde diminue.

{{figure(src="./img/sine_waves_wiki.svg",
       click_to_open=true,
       style="width: 480px;",
       caption="Exemple d'ondes du spectre visible (Rouge: 750nm, Orange: 620nm, Vert: 520nm, Bleu: 470nm, Violet: 380nm)",
       class="center",
       caption_style="") }}

| Couleur  | Longueur d'Onde | Fréquence |
|----------|-----------------|-----------|
| Rouge    |    ~ 750 nm     | ~ 400 THz |
| Orange   |    ~ 620 nm     | ~ 480 THz |
| Vert     |    ~ 520 nm     | ~ 580 THz |
| Bleu     |    ~ 470 nm     | ~ 640 THz |
| Violet   |    ~ 380 nm     | ~ 790 THz |

{% end %}

Quasiment tout ce qui émet de la lumière, y compris le soleil, produit des infrarouges, en plus ou moins grande quantité. Lorsque notre signal est émis, il se trouve immergé dans un environnement rempli d'infrarouges. Le défi réside alors, pour le récepteur, dans la différenciation de notre signal par rapport au _bruit_ ambiant.

La méthode la plus simple consiste à appliquer une technique similaire à celle utilisée en émission radio, en utilisant une porteuse. Le récepteur peut ainsi distinguer les informations du signal parmi le bruit en cherchant une fréquence de 38 kHz. Cette fréquence de 38 kHz sert de référence pour séparer le _signal_ d'intérêt du fond infrarouge, permettant ainsi au récepteur de reconnaître et de traiter correctement les données transmises.

# Sortez vos ESP ! A l'abordage ! 🏴‍☠️

## Générer la porteuse
Bien ! Commençons par le plus simple. La porteuse est donc un signal carré, de fréquence 38kHz (pour la 30e fois). On pourrait prendre un NE555 :heart:, deux résistances de 4 ohms et un condensateur de 4.8 µF... Oui ce sera bien... Mais je vous propose d'utiliser le [PWM](https://fr.wikipedia.org/wiki/Modulation_de_largeur_d%27impulsion) de l'ESP, c'est plus simple est ça marche tout aussi bien...

Le fonctionnement est très simple, on va régler la fréquence du PWM sur la valeur de notre porteuse et le [rapport cyclique](https://fr.wikipedia.org/wiki/Rapport_cyclique) à 50%. En utilisant un transistor, on pourra "allumer" ou "éteindre" notre LED, sans nous soucier de la porteuse.

{{figure(src="./img/schema.png",
       click_to_open=true,
       style="width: 75%;",
       caption="Schematique simplifié de la LED IR",
       caption_style="") }}

## Si on codait

On ne va traiter "que" la partie télécommande. Le code permettant la connexion au WiFi, ou sa configuration ne vont pas être traités ici. De plus, le code étant assez long je ne vais pas le détailler en totalité, je vais juste m'attarder sur quelques points que je trouve important. Je vous invite à regarder le code, disponible sur GitHub: [https://github.com/jnthbdn/esp_clim_controller/blob/main/src/panasonic_remote.h](https://github.com/jnthbdn/esp_clim_controller/blob/main/src/panasonic_remote.h)

### Vous reprendrez bien une constante ?

```c++
constexpr unsigned long STOP_BIT_LOW_TIME  = 10000;

constexpr unsigned long START_BIT_HIGH_TIME = 3500;
constexpr unsigned long START_BIT_LOW_TIME  = 1700;

constexpr unsigned long BIT_HIGH_TIME  = 430;
constexpr unsigned long BIT_LOW_0_TIME = 440;
constexpr unsigned long BIT_LOW_1_TIME = 1300;

constexpr uint8_t PANASONIC_DATA_SIZE = 27;
```

Depuis que `constexpr` existe, je ne sais pas comment j'ai fait pour m'en passer...(_sûrement avec des `#define`_...).  
On déclare les temps de chacun des "bit" dont on va avoir besoin pour émettre un message. Notez que l'on pourrait se passer de `BIT_HIGH_TIME` puisqu'il est quasiment égal à `BIT_LOW_0_TIME`, mais je trouve que ça rend le code (qui arrive) plus lisible et on identifie plus facilement l'étape de transmission en cours.

La dernière constante `PANASONIC_DATA_SIZE` nous servira pour les itérations, cela évite d'avoir des "magic number"[^2] qui se baladent dans le code.


### L'initialisation
```c++
PanasonicRemote(byte pin_pwm, byte pin_led) : pin_pwm{pin_pwm}, pin_led{pin_led}, data{ new uint8_t[PANASONIC_DATA_SIZE] }{
    // Header
    data[0] = 0b00000010;
    data[1] = 0b00100000;
    data[2] = 0b11100000;
    data[3] = 0b00000100;
    data[4] = 0b00000000;
    data[5] = 0b00000000;
    data[6] = 0b00000000;
    data[7] = 0b00000110;

    // Body
    data[8] = 0b00000010;
    data[9] = 0b00100000;
    data[10] = 0b11100000;
    data[11] = 0b00000100;
    data[12] = 0b00000000;
    data[13] = 0b00001000;
    data[14] = 0b00110010;
    data[15] = 0b10000000;
    data[16] = 0b10101111;
    data[17] = 0b00000000;
    data[18] = 0b00000000;
    data[29] = 0b00001110;
    data[20] = 0b11100000;
    data[21] = 0b00000000;
    data[22] = 0b00000000;
    data[23] = 0b10001001;
    data[24] = 0b00000000;
    data[25] = 0b00000000;
    data[26] = 0b11100110;
}

void init(){
    analogWriteRange(1024);
    analogWriteFreq(38000);
    pinMode(pin_pwm, OUTPUT);
    analogWrite(pin_pwm, 512);
    pinMode(pin_led, OUTPUT);
    digitalWrite(pin_led, LOW);
}
```

Le gros "constructeur" ne fait pas grand chose à part initialiser nos variables. On remarque que les données de trames, par défaut, sont:
 - État : OFF
 - Température: 25.0°C
 - Mode: AUTO

Et voici `init`, la fonction qui met en place la porteuse. Pour ne pas avoir de mauvaise blague on se met d'accord sur le "range" (la plage) de valeurs utilisées pour définir le duty cycle du PWM avec `analogWriteRange`. Je prends `1024` pour deux raisons:
 1. Par pure convention et parce que j'ai l'habitude.
 2. Potentiellement on peut vouloir utiliser le PWM ailleurs dans le projet, donc autant garder une plage de valeur correcte.

Il faut donc utiliser la valeur `512` pour mettre le duty cycle à 50% (et 0 pour le mettre à 0%, j'espère que vous suivez).

Il nous reste à préciser la valeur de la fréquence avec `analogWriteFreq`. Les autres fonctions paramètrent les pin en sortie, et leurs valeurs par défauts.

### On / Off

```c++
PanasonicRemote& turnOn(){
    setBit(13, 0);
    compute_checksum(); 
    return *this;
}

PanasonicRemote& turnOff(){
    setStreamMode(StreamMode::AUTO);    // Même comportement que la télécommand d'origine
    clearBit(13, 0);
    compute_checksum();
    return *this;
}
```

Pour définir l'état (on ou off) de la climatisation j'ai pris le parti de faire deux fonctions (qui retournent l'objet lui-même pour "chaîner" les appels si on le souhaite). Dans le but de simplifier le code (tant en lecture, qu'en écriture), j'utlise `clearBit` et `setBit` pour, respectivement, forcer un bit à 0 ou a 1, pour un octet donné.

Après chaque modification de la trame on doit recalculer le 'checksum', c'est le rôle de `compute_checksum`, que l'on verra un peu plus tard.

Les plus observateurs d'entre vous, auront remarqué une ligne en plus dans `turnOff`. Comme dit dans la partie 1, la télécommande repasse le mode de ventilation en `AUTO`, c'est très certainement pour ne pas qu'il reste activé en permanence, je le désactive donc moi aussi, par précaution.

### Mode de ventilation
```c++
PanasonicRemote& setStreamMode(StreamMode mode){

    switch(mode){
        case StreamMode::POWERFULL:
            clearBit(21, 5);
            setBit(21, 0);
            break;
        
        case StreamMode::QUIET:
            clearBit(21, 0);
            setBit(21, 5);
            break;
        
        default:
        case StreamMode::AUTO:
            clearBit(21, 5);
            clearBit(21, 0);
            break;
    }
    
    compute_checksum();
    return *this;
}
```

Il n'y a rien de particulier dans le code, juste une `enum` qui permet d'assurer que l'utilisateur ne fasse pas (inconsciemment du moins) de bêtise.

### Température
```c++
PanasonicRemote& setTemperature(uint8_t temp, bool half){

    if( 16 <= temp && temp <= 30){

        data[14] &= 0b11000001;
        data[14] |= temp << 1;

        if( half && temp < 30){
            setBit(14, 0);
            compute_checksum();
        }
        else{
            clearBit(14, 0);
            compute_checksum();
        }
    }
    return *this;
}
```

Le réglage de la température ne se limite pas à un simple bit, comme pour les autres réglages, c'est un petit peu plus subtil. Déjà, il faut s'assurer que la température est correcte, c'est la responsabilité de la ligne `if( 16 <= temp && temp <= 30)`. Si la température n'est pas bonne, alors on ne fait rien, on ignore la demande. Dans le cas contraire, on commence par "effacer" la température enregistrée `data[14] &= 0b11000001;` effectue un "et logique" afin de forcer les bits 6 à 2 au niveau logique 0. Puis on enregistre la valeur **entière** de la température avec `data[14] |= temp << 1;` (`<<` signifie que l'on décale d'un bit vers la _gauche_). Reste en ensuite à gérer le "demi", mais seulement si la valeur est strictement inférieure à 30°C.


### Feu !

```c++
void send(){
    
    start_bit();

    // Header
    for( unsigned octet = 0; octet < 8; ++octet ){
        for( unsigned bit = 0; bit < 8; bit++ ){
            set_high();
            delayMicroseconds(BIT_HIGH_TIME);
            set_low();

            if( (data[octet] & (1 << bit)) > 0 )
                delayMicroseconds(BIT_LOW_1_TIME);
            else
                delayMicroseconds(BIT_LOW_0_TIME);
        }
    }

    stop_bit();
    start_bit();

    // Body
    for( unsigned octet = 8; octet < PANASONIC_DATA_SIZE; ++octet ){
        for( unsigned bit = 0; bit < 8; bit++ ){
            set_high();
            delayMicroseconds(BIT_HIGH_TIME);
            set_low();

            if( (data[octet] & (1 << bit)) > 0 )
                delayMicroseconds(BIT_LOW_1_TIME);
            else
                delayMicroseconds(BIT_LOW_0_TIME);
        }
    }

    stop_bit();
}

// [...]

inline void set_high(){
    digitalWrite(pin_led, HIGH);
}

inline void set_low(){
    digitalWrite(pin_led, LOW);
}
```
Tout ce qui nous reste à faire maintenant, c'est d'envoyer nos paramètres. Comme toutes les trames on doit envoyer notre "bit de start" pour prévenir le récepteur que l'on va envoyer des données, c'est `start_bit` qui s'en charge. Les premières données transmises sont celles du header, soit les 8 premiers octets de notre trame. On remarque l'utilisation de `set_high` et `set_low` qui ne sont présentes que pour rendre le code plus lisible. On retrouve nos constantes de temps que nous avons déclarées au début du programme.

Une fois le header transmit c'est au tour du body, mais avant cela il faut marqué la fin de cette première partie, on emet un "bit de stop" suivi d'un "bit de start". Puis, en suivant la même procédure, on envoie le reste de la trame.

# Pour finir
Maintenant que nous avons une classe qui permet de produire et d'émettre les trames pour contrôler notre climatiseur, il ne reste plus qu'à l'utiliser comme bon nous semble ! Pour ma part il sera contrôlé via une API Web mise a disposition par l'ESP. Cette même API sera utilisée par HomeAssistant.

Retrouvez le projet PlatformIO sur mon [GitHub](https://github.com/jnthbdn/esp_clim_controller).

  
<p class="right">Bidouillez-bien</p>

--- 
[^1]: D'après l'ISO 20473:2007. [Source](https://fr.wikipedia.org/wiki/Infrarouge#D%C3%A9coupage_ISO)

[^2]: Des valeurs non nommées, et dont il peut être difficile de connaître la signification ou la raison de leurs utilisations. [Source](https://fr.wikipedia.org/wiki/Nombre_magique_(programmation)#Constantes_num%C3%A9riques_non_nomm%C3%A9es)