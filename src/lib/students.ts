// Список группы ЮФ МГУ-120. Пароли здесь не хранятся, только их хэши (scrypt с солью).
// Чтобы добавить человека или сменить пароль, хэш считается так же: scryptSync(пароль, соль, 32).
export const GROUP = "ЮФ МГУ-120";

export type Student = { login: string; firstName: string; lastName: string; salt: string; hash: string };

export const STUDENTS: Student[] = [
  { login: "anatoliy.abramov", firstName: "Анатолий", lastName: "Абрамов", salt: "ecc3198deec2a2a30932ac2372a1d8e8", hash: "e87953fad636399c826d757a059d992e90c8fa8a81b240ec6d32c34d7595831d" },
  { login: "natalya.alisina", firstName: "Наталья", lastName: "Алисина", salt: "64bf565ad87bd98bcc694e4fbed03194", hash: "4014d5e9d745072974cd05c80f1ff1ff78386ed908b1e30a076f901650a95d25" },
  { login: "anna.barbashina", firstName: "Анна", lastName: "Барбашина", salt: "aac1385a22b37b7e83c7a090ac41d24f", hash: "3482121df3f6d420cb5b728a5a06a507e15bf61422d5de077429e6169f18a4a7" },
  { login: "veronika.grib", firstName: "Вероника", lastName: "Гриб", salt: "791c844e6f547d187fe0c6df4cca4efa", hash: "21c81d65f8a6cb06dfe0a2030f6053f5ebecde1cca64ce79255a03b9ad469141" },
  { login: "angelina.grishchenko", firstName: "Ангелина", lastName: "Грищенко", salt: "3fd2dfbd1aa3d77f79867146c1c7df76", hash: "2b0649e896ce667c305daba3efa72dc87ddee3d42fbf2d2fd9772faab3660ab7" },
  { login: "elmin.guliev", firstName: "Эльмин", lastName: "Гулиев", salt: "4a13a44ad83ccdeb08961007f70ab796", hash: "5fb8fd59a078cf0f07eab338d70fa2685f43ac08eeac6b08505227607173950d" },
  { login: "ivan.gusev", firstName: "Иван", lastName: "Гусев", salt: "96d4baaa6f95694cc3c1537b1e30602b", hash: "98624b1ee49c4a13ca51a3a6f14f6603a6d89e444c7aa23222eb0667c5d4d1f4" },
  { login: "varvara.dronova", firstName: "Варвара", lastName: "Дронова", salt: "947dd7688706685a64121a3c3161a3d9", hash: "ae563f25c773edf436764b6702377e34609b2e0908aa4149b25b57ecb7980a7c" },
  { login: "varvara.kabanova", firstName: "Варвара", lastName: "Кабанова", salt: "1c4989e7d25efdd3d709a91059ec0948", hash: "c189c3d0f0d0870646c937b2cb8cf386a453212818a8885b74dc77f7d30c0a98" },
  { login: "darya.kuznetsova", firstName: "Дарья", lastName: "Кузнецова", salt: "d206c08f82d501d076bf917ce4f58d32", hash: "b875c8bbfa6f4061821903a045cac8c4db87507652c1a73b1b370fb1c0433170" },
  { login: "mariya.kirshina", firstName: "Мария", lastName: "Киршина", salt: "46b3f6d0cf04bd9ceffea9f374e4a677", hash: "12ff7b6b81f638b3bbcc6e3878a3ac6ab8e01b7aa42fabdba2f2cc2333e05dac" },
  { login: "lev.kravchenko", firstName: "Лев", lastName: "Кравченко", salt: "c6c62d62eef9b707fd1026ea5e42cbe4", hash: "b0dd5877fcccd4a86d23583bcd94812e30364ccb1243089c5dd8ed2c9d61bc40" },
  { login: "aleksandr.kunafin", firstName: "Александр", lastName: "Кунафин", salt: "f2b03e3ce908acf29c2760130e9b84ab", hash: "df3444c8a98d4cd93d2b736f25320f75d4b0f26d4bb86946ffed3e09ad7bc097" },
  { login: "katerina.malakhova", firstName: "Катерина", lastName: "Малахова", salt: "129244a6401fbfe4e707bdf8ab7c91a5", hash: "97d827bdc1a2a0f95290c97edcd6cb386e6af5db346e133924fd112f47d688d7" },
  { login: "elza.metaeva", firstName: "Эльза", lastName: "Метаева", salt: "9ab246598b521104e2386bae51e971e1", hash: "5b3f3ed29e4c675f26c3bfbb016d53146aab2cbaccb7c3ce9f8312265f5fe4f5" },
  { login: "viktoriya.milashevskaya", firstName: "Виктория", lastName: "Милашевская", salt: "c7f780fbabcb23205e21c3c24ff40463", hash: "a9c0e3d6cf55fdccd27966eb319d7874895869ad8eb9cecb3401ba5fa4b225e2" },
  { login: "darya.mikhaylenko", firstName: "Дарья", lastName: "Михайленко", salt: "ab198b1b0c698b548f0ec0dde8d9805b", hash: "f3f072831ffc9d45698990aae2a3f40640cd44f55a00a7221219b7872021490d" },
  { login: "bagrat.ovsepyan", firstName: "Баграт", lastName: "Овсепян", salt: "195cf7573a484071c3296db210a80a36", hash: "6fbcfddcb1521838b1cefdff84e2d4d08b8ab5654fb282b5790bd2f0a972d631" },
  { login: "nikolay.pirogov", firstName: "Николай", lastName: "Пирогов", salt: "299aef69f33d80bf85670f5e10ed3a25", hash: "ae217eda04070f631c1365674fe1fcf98319880ad2a19bcbbf16eefed22ebdad" },
  { login: "artur.popov", firstName: "Артур", lastName: "Попов", salt: "819d90fd92608ec3b22cee25bcaa91dd", hash: "8bd55f096a0d99b9cf91b392715a418435f3d5b8e64e14cfc93f31785721fa66" },
  { login: "vladimir.savchenko", firstName: "Владимир", lastName: "Савченко", salt: "5707b544a372c27c12b7c1aacb594bb9", hash: "c683b7b1da668a91000c89d858be24415285ce2fb0455f19f503c8866e70928d" },
  { login: "oksana.smola", firstName: "Оксана", lastName: "Смола", salt: "28a7369f10548382720e2b8dd2006042", hash: "2935a58cd2e2b0df66ba45f24be0c0b07ce2c87cbdf34a9d8262c09ff620ea32" },
  { login: "lada.soboleva", firstName: "Лада", lastName: "Соболева", salt: "f838410cb359032159384e37e8675978", hash: "621ee3df730d659ddbeb776bdd19ecd8014ac48a58172f070a9d95c58429b015" },
  { login: "kirill.tkachev", firstName: "Кирилл", lastName: "Ткачев", salt: "fde4036195a81a079c2e89eecfdf590f", hash: "7da220070fd83ba8ee3cce9ed1f538a2f7cef6db3a40a1430b106dbdd8413ccc" },
  { login: "gleb.ulko", firstName: "Глеб", lastName: "Улько", salt: "4ba848883c2cfce1aa4e8cc3d2219207", hash: "bb04ad2152664414266fd24b9af2b07e32c9ec8dca71da25fff9f7db16972c5b" },
  { login: "petr.kharchikov", firstName: "Пётр", lastName: "Харчиков", salt: "e31259a5450113428dd55fcd46c19217", hash: "a61bf5e3f22fe302f1a48f7e15f34b2d4c54ecb8e7e2f720a2a1683e07a6b8d7" },
  { login: "darya.chernitskaya", firstName: "Дарья", lastName: "Черницкая", salt: "91864150feca41764f848c3fc3e7221c", hash: "8e3bc48ca0883eed18aa805dd2bd3a525b717b77f00d109d1ffeb9c9eed935ce" },
  { login: "darya.yankova", firstName: "Дарья", lastName: "Янькова", salt: "5b7b2a8f7d88d114cdcae189bcc390dd", hash: "430411ae7ae758bf7137f5872329cb5c12e5a645d632942e6f3339253e24a56d" },
  { login: "sergey.yatseyko", firstName: "Сергей", lastName: "Яцейко", salt: "aa6640e73d55b9c397b14e32f60a52a2", hash: "d6349375ad4f54c75a88f3e6825d99341d4cf7f752d8ef8549cad76c95ce7df6" },
];
