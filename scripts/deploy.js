import { deployRocketPool } from '../test/_helpers/deployment';

deployRocketPool().then(function() {
    process.exit(0);
});