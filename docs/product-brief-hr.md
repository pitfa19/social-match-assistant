# Produktni sažetak: problem, uloga AI-ja i korištenje

**Datum:** 8. listopada 2026.
**Status:** produktna definicija za raspravu i prezentaciju. Aplikacija još nema konačan naziv. Opis ciljnog proizvoda nije tvrdnja da su sve funkcije već implementirane ili da je potražnja potvrđena istraživanjem.

## Ukratko: odgovori za prezentaciju

### Kome se događa problem i zašto je problem?

Ljudi koji u Zagrebu traže sobu, povremeni posao, praktičnu pomoć ili predmet za posudbu moraju sami pregledavati različite objave i procjenjivati odgovaraju li njihovoj situaciji. S druge strane, ljudi koji nešto nude moraju odlučiti gdje i kako opisati svoju ponudu. Naša je polazna hipoteza da relevantna prilika često postoji, ali je teško pronaći, usporediti i pretvoriti u sljedeći konkretan korak. Problem nije samo nedostatak objava, nego nedostatak osobno relevantnog pregleda i jasnog načina izražavanja vlastite potrebe.

### Što AI konkretno radi u rješenju i zašto je važan?

AI pretvara korisnikov opis u profil koji korisnik potvrđuje, razumije sadržaj neujednačenih objava te procjenjuje koje prilike odgovaraju njegovoj namjeri. Objašnjava podudaranje i priprema nacrt objave iz potvrđenih činjenica. Važan je zato što ljudi istu potrebu izražavaju različitim riječima: razumjeti značenje i kontekst nije isto što i pronaći istu ključnu riječ. AI je zato planirana jezgra povezivanja korisnikove namjere s prilikama, a ne samo chatbot dodan na sučelje. Cijenu, lokaciju i druge izričite granice ipak provjerava obična programska logika prije AI rangiranja.

### Što gradimo i kako se koristi?

Gradimo web-aplikaciju na hrvatskom koja pomaže korisniku pronaći ono što mu odgovara i napisati bolju objavu za ono što treba ili nudi. Korisnik se predstavi tekstom ili glasom, potvrdi svoj profil i odabere „Pretraži”. Dobiva pregled relevantnih prilika s razlozima podudaranja, a po potrebi izrađuje i uređuje vlastiti zahtjev ili ponudu. Kontaktiranje i objavljivanje ostaju pod njegovom kontrolom.

---

## 1. Problem i ciljni korisnici

### Početni fokus

**Preporučeni prvi segment za provjeru:** studenti i mladi zaposleni u Zagrebu koji koriste online zajednice za konkretne lokalne potrebe. Primjerice, traženje sobe, povremeni angažman ili posudba alata. Ovo je fokus za početni test, ne odluka da proizvod ostane isključivo za studente ili najam.

Dvije korisničke situacije:

- **Tražim:** imam potrebu, lokaciju, rok, budžet ili druge uvjete i želim pronaći odgovarajuću priliku.
- **Nudim:** imam vještinu, predmet ili uslugu i želim pronaći relevantne zahtjeve ili jasno opisati svoju ponudu.

Volontiranje je jedan slučaj korištenja. Proizvod nije ograničen na volontiranje i nije sustav za ocjenjivanje ili odabir ljudi za druge osobe.

### Zašto je to problem?

Polazne hipoteze koje treba provjeriti s korisnicima:

1. **Pretraga je raspršena.** Korisnik ponavlja traženje na više mjesta, umjesto da dobije pregled za svoju konkretnu namjeru.
2. **Objave nisu usporedive.** Cijena, mjesto, dostupnost i uvjeti mogu biti nejasni, različito napisani ili izostavljeni.
3. **Ista riječ ne znači dobru priliku.** Objava može spominjati „sobu”, a ipak biti izvan budžeta ili neprikladne lokacije.
4. **Ponuda se teško pretvara u objavu.** Korisnik ne zna koje podatke uključiti, kako formulirati zahtjev i kojoj vrsti zajednice pripada.
5. **Relevantnost ima rok.** Stara objava može biti zanimljiva, ali više nije dostupna. Vrijeme objave nije dokaz dostupnosti.

**Željeni ishod:** manje ručnog pregledavanja i brži dolazak do prilike koju korisnik može provjeriti, spremiti ili kontaktirati. Ne obećavamo pronalazak stana, posao, odgovor autora ili sigurnost transakcije.

### Vrijednosna ponuda

> Pronađi ono što odgovara tvojoj stvarnoj situaciji i jasno napiši što trebaš ili nudiš, koristeći profil koji sam kontroliraš.

Razlika koju želimo testirati nije „imamo bolji Facebook algoritam”, nego **namjerno zadana i uređiva osobna namjera**, povezana s konkretnim uvjetima, objašnjenim rezultatima i pripremom vlastite objave. To nije dokazana jedinstvenost u odnosu na konkurente.

## 2. Uloga AI-ja u ciljnom proizvodu

| Korak | Konkretna zadaća AI-ja | Kontrola i granica |
| --- | --- | --- |
| Predstavljanje | Iz razgovora predlaže tekstualni profil i izdvaja izričito navedene potrebe, vještine i uvjete. | Korisnik uređuje i potvrđuje. Nema skrivenog zaključivanja o osobnosti. |
| Razumijevanje objava | Prepoznaje je li zapis zahtjev ili ponuda, kategoriju i navedene uvjete. | Nepoznati podaci ostaju nepoznati. Sadržaj izvora nije instrukcija sustavu. |
| Procjena relevantnosti | Nakon dohvaćanja kandidata i čvrstih filtara procjenjuje semantičko podudaranje s trenutnom namjerom. | Rangira prilike za korisnika, ne vrijednost ili podobnost ljudi. |
| Objašnjenje | Pokazuje što odgovara, što ne odgovara i što treba dodatno provjeriti. | Objašnjenje mora biti vezano uz stvarne podatke, bez izmišljenih razloga ili postotaka sigurnosti. |
| Priprema objave | Pretvara potvrđenu potrebu ili ponudu u jasan, uređiv nacrt. | Bez izmišljenih cijena, iskustva ili obećanja. Korisnik objavljuje ručno. |

**Primjer značenja:** korisnik traži „nešto čime mogu izbušiti dvije rupe”, a objava nudi „posudbu bušilice”. AI treba prepoznati relevantan predmet i namjeru posudbe, iako se izrazi razlikuju. To je planirani primjer ponašanja, ne izmjerena kvaliteta sadašnjeg sustava.

**Bez AI-ja** aplikacija bi i dalje mogla imati obrasce, filtre, spremanje i pretragu po riječima. Izgubila bi planirano razumijevanje slobodnog opisa i usporedbu različito formuliranih potreba i ponuda. To je razlog za AI, ali prednost treba dokazati usporedbom s jednostavnom pretragom, a ne samo pokazati uvjerljiv chatbot.

### Uloge komponenti

- **Mindcase:** planirani način prikupljanja sadržaja iz dopuštenih izvora. Nije sam po sebi personalizirano povezivanje i ne daje automatsko pravo korištenja tuđih podataka.
- **Decision API:** odabrani smjer za kategorizaciju i procjenu relevantnosti kandidata. Točan ugovor, kvaliteta hrvatskog jezika i integracija zahtijevaju provjeru. Nije zamjena za bazu i indeks.
- **ElevenLabs:** planirana transkripcija glasa u tekst. Korisnik može ispraviti tekst. Glas je lakši ulaz, ali nije jedini razlog za AI u proizvodu.
- **Baza i programska logika:** pohrana, indeksi, dohvat, deduplikacija, vremenski prozor i čvrsti filtri. Model za profil i generiranje nacrta još treba zasebno potvrditi, ne pretpostavljamo da Decision API automatski pokriva sve te zadaće.

## 3. Što gradimo i korisnički tijek

### Dva profila

**Profil korisnika:** ono što korisnik izričito kaže o sebi, vještinama, preferencijama i ograničenjima. Može se promijeniti ili izostaviti iz pojedine pretrage.

**Profil potrebe ili ponude:** konkretan zahtjev, predmet, usluga ili prilika, s opisom, uvjetima i nedostajućim informacijama. Trenutna pretraga nije trajna osobina korisnika.

### Glavni tijek

1. **„Predstavi se”** otvara razgovor s unosom teksta ili mogućnošću „Pritisni za govor”. Korisnik potvrđuje uređiv tekstualni profil. Nakon spremanja gumb se zove **„Profil”**.
2. **„Pretraži”** otvara unos trenutne namjere. Pretraga je moguća i bez spremljenog profila, a korisnik odlučuje želi li ga uključiti.
3. **Rezultati** prikazuju prilike, izvor, vrijeme objave ili dohvaćanja i objašnjenje podudaranja. Prekoračen budžet isključuje se iz odgovarajućih rezultata, a nepoznati uvjeti jasno su označeni.
4. **„Pomozi mi napisati objavu”** izrađuje nacrt za potrebu ili ponudu iz potvrđenih podataka. Predlaganje mjesta objave oslanja se na provjeren, dopušten katalog zajednica ili primjere, ne na obećanje neograničenog Facebook pristupa.
5. **Korisnik provjerava i djeluje:** uređuje nacrt, kopira ga, otvara stvarni izvor kada postoji i sam kontaktira ili objavljuje. Aplikacija ne objavljuje automatski.

### Tri izvora podataka i svježina

Ciljni proizvod ima tri odvojeno označena izvora: dopušten sadržaj s Facebooka, dopušten sadržaj s Reddita te zahtjeve i ponude koje objavljuju naši korisnici. **Osobni profil nije automatski javna objava.**

Početnu ponudu planiramo graditi iz vanjskih izvora, a kasnije je nadopunjavati vlastitim objavama. To vrijedi samo gdje su pristup, obrada i zadržavanje sadržaja dopušteni. Ako dopušten izvor nije dostupan, sustav to pokazuje umjesto da tvrdi da ga pretražuje.

Pretraga prvo koristi postojeće indeksirane zapise. Po potrebi pokreće ograničeno osvježavanje najnovijih objava, uklanja duplikate i obrađuje nove ili izmijenjene zapise. Zapisi izvan konfiguriranog vremenskog prozora prestaju sudjelovati u aktivnoj pretrazi. Ponovno korištenje između korisnika ovisi o dopuštenjima izvora i pravilima privatnosti. Svježe dohvaćanje nije jamstvo da ponuda još vrijedi.

## 4. Primjer u Zagrebu

**Izmišljeni scenarij za demonstraciju, ne stvarna objava ni dokaz potražnje.**

Studentica navede da traži sobu na Trešnjevci do **450 € ukupno s režijama**. Aplikacija zabilježi samo te potvrđene uvjete. U dostupnim primjerima soba od 430 € s uključenim režijama prolazi budžetski filtar. Soba od 500 € ne prolazi. Oglas od 400 € bez podatka o režijama označava se kao neizvjestan, ne kao siguran rezultat unutar budžeta.

AI treba razumjeti da „tražimo cimericu” može sadržavati priliku za sobu, iako naslov ne kaže „iznajmljuje se soba”. Korisnici pokazuje zašto je objava relevantna i koji podatak nedostaje. Po želji priprema objavu s njezinim potvrđenim uvjetima, bez izmišljanja zaposlenja, jamca ili datuma useljenja.

**Vrijednost nije „AI joj je pronašao stan”, nego „dobila je pregled prema svojim uvjetima i jasan sljedeći korak”.**

## 5. Što postoji, što je plan i što treba dokazati

Stanje pregledano 8. listopada 2026. Dok traje paralelni razvoj, ovaj odjeljak nije izvješće o konačnom završetku aplikacije.

- **Postojeći frontend demonstrira:** hrvatsko sučelje, predstavljanje kroz unaprijed zadane demo poruke, lokalni profil, sintetičke prilike, determinističku pretragu i lokalno snimanje zvuka. To nije povezan AI ni stvaran Facebook/Reddit feed.
- **Postojeći backend:** izolirani lokalni FastAPI adapter za Mindcase grupni zahtjev i dohvat rezultata. Njegov zabilježeni test koristi simulirani transport. Uspješna živa integracija, indeksirana baza i AI rangiranje nisu time dokazani.
- **Planirani proizvod:** stvarna transkripcija, potvrđeno AI izdvajanje profila, dopušteni izvori, vremenski prozor, indeksiranje, AI relevantnost i nacrti.
- **Otvorene pretpostavke:** stvarna korisnička bol, dovoljna ponuda iz dopuštenih izvora, bolji rezultati od obične pretrage, trošak po korisnom rezultatu i prihvatljivost profila koji korisnik sam uređuje.

### Kako provjeriti vrijednost prije većih obećanja

Na istom dopuštenom ili sintetičkom skupu usporediti običnu pretragu i AI potpomognuti tijek. Odvojeno označiti rezultate na stvarnim podacima i rezultate na demo podacima. Mjeriti vrijeme do prvog relevantnog rezultata, broj korisno ocijenjenih rezultata u prvih pet, kršenja čvrstih uvjeta i broj ispravaka izmišljenih činjenica u profilu ili nacrtu. Za kršenja čvrstih uvjeta i izmišljene činjenice cilj je nula, ne tvrdnja da je već postignut.

U razgovorima s početnim korisnicima provjeriti kada su zadnji put tražili takvu priliku, kako su tražili, gdje su zapeli i bi li im ovakav tijek stvarno olakšao sljedeći pokušaj. Korist i tržišna prednost ostaju hipoteze dok nemamo opažene rezultate.

## Osnova dokumenta

Primijenjen je okvir `product-strategy-session`: ciljni korisnik, problem, posao koji želi obaviti, konkretna vrijednost i provjera pretpostavki. Ovo nije završen višetedni strateški proces ni novo tržišno istraživanje.

Osnova su vlasnikove odluke iz razgovora, [postojeći koncept](concept.md), [prijedlog Mindcase integracije](mindcase.md), aktualni frontend i [backend opis](../backend/README.md). Stariji `docs/stack.md` i dijelovi README-ja još opisuju raniju setup fazu. Za opaženo stanje backend adaptera korišten je `.mozak/evidence/backend-mindcase/acceptance.md`, uz granicu da su transportni testovi simulirani. Ovaj dokument ne mijenja ovlasti, planove ni rad drugih sesija.
